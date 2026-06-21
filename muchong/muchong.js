/*
 Author: @toulanboy 
 Modified for Surge compatibility
 
📕地址：https://github.com/toulanboy/scripts
📌不定期更新各种签到、有趣的脚本，欢迎star🌟
    
配置步骤 （请先认真阅读配置，再进行操作）
 1. 根据你当前的软件，配置好srcipt。Tips:由于是远程文件，记得顺便更新文件。
 2. 打开小木虫app => 发现页面 => 签到领红包 => 拆红包。弹出通知，即获取成功。
 3. 回到quanx等软件，关掉获取cookie的rewrite。（loon是关掉获取cookie的脚本）
 4. 手动跑1次，看看是否能获取到今天签到的金币数。
 
Surge:
[Script]
小木虫获取Cookie = type=http-request,pattern=^https?:\/\/mapi\.xmcimg\.com\/bbs\/memcp\.php\?action,script-path=muchong.js,requires-body=false,timeout=10
小木虫签到 = type=cron,cronexp="5 0 * * *",script-path=muchong.js,wake-system=true,timeout=60
QuanX:
[rewrite_local]
^https?:\/\/mapi.xmcimg.com\/bbs\/memcp.php\?action url script-request-header muchong.js
[task_local]
5 0 * * * muchong.js, tag=小木虫论坛
Loon:
[script]
cron "5 0 * * *" script-path=muchong.js, timeout=600, tag=小木虫论坛
http-request ^https?:\/\/mapi.xmcimg.com\/bbs\/memcp.php\?action script-path=muchong.js,requires-body=false, tag=小木虫论坛cookie获取
 
[MITM]
hostname = *.xmcimg.com
*/
var scriptName = '🦜小木虫论坛';
var headerKey = 'muchong_headers';
var debugMode = false;
// ============== 平台兼容层 ==============
var isSurge = typeof $httpClient !== 'undefined';
var isQuanX = typeof $task !== 'undefined';
var isLoon = typeof $loon !== 'undefined';
function log(msg) {
    console.log(scriptName + ' ' + msg);
}
function notify(title, subtitle, body) {
    if (isSurge) {
        $notification.post(title, subtitle, body);
    } else if (isQuanX) {
        $notify(title, subtitle, body);
    } else if (isLoon) {
        $notification.post(title, subtitle, body);
    }
    log(title + ' ' + subtitle + ' ' + body);
}
function readData(key) {
    if (isSurge || isLoon) {
        return $persistentStore.read(key);
    } else if (isQuanX) {
        return $prefs.valueForKey(key);
    }
    return null;
}
function writeData(val, key) {
    if (isSurge || isLoon) {
        return $persistentStore.write(val, key);
    } else if (isQuanX) {
        return $prefs.setValueForKey(val, key);
    }
    return false;
}
function httpPost(options, callback) {
    if (isSurge || isLoon) {
        $httpClient.post(options, function(error, response, data) {
            if (response) {
                response.statusCode = response.status;
            }
            callback(error, response, data);
        });
    } else if (isQuanX) {
        options.method = 'POST';
        $task.fetch(options).then(function(resp) {
            resp.status = resp.statusCode;
            callback(null, resp, resp.body);
        }, function(err) {
            callback(err.error, err, err);
        });
    }
}
function done(val) {
    $done(val || {});
}
// ============== 业务逻辑 ==============
function getCookie() {
    if (typeof $request !== 'undefined') {
        var headersStr = JSON.stringify($request.headers);
        writeData(headersStr, headerKey);
        log('获取到的headers: ' + headersStr);
        notify(scriptName, '📌获取会话成功', '');
        done({});
        return true;
    }
    return false;
}
function buildHeaders() {
    var rawHeaders = readData(headerKey);
    if (!rawHeaders) {
        notify(scriptName, '❌获取Cookie失败', '请先按照说明获取Cookie再运行签到任务！');
        return null;
    }
    
    var headers = {};
    try {
        headers = JSON.parse(rawHeaders);
    } catch (e) {
        log('解析headers失败: ' + e);
        notify(scriptName, '❌Cookie格式错误', '请重新获取Cookie');
        return null;
    }
    
    // 清理可能引起冲突的header
    var keysToDelete = [
        'Content-Length', 'content-length',
        'Content-Type', 'content-type',
        'Host', 'host',
        'Connection', 'connection',
        'Accept-Encoding', 'accept-encoding',
        'Transfer-Encoding', 'transfer-encoding'
    ];
    for (var i = 0; i < keysToDelete.length; i++) {
        delete headers[keysToDelete[i]];
    }
    
    // 设置表单Content-Type
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    
    return headers;
}
// ============================================================
// 关键修改：服务器返回 GBK 编码页面，Surge 按 UTF-8 解码后
// 中文全部变成乱码，所以匹配时只能使用纯 ASCII 的 HTML 标签
// 和属性名，不能依赖中文文字匹配。
// 
// 策略：
//   1. 查找 formhash 隐藏字段（纯 ASCII）→ 尚未签到，需要签到
//   2. 查找 <em>数字</em> 模式（纯 ASCII）→ 已签到，提取金币数
//   3. 签到POST后同样用 <em> 标签解析金币数
// ============================================================
function getHashcode() {
    return new Promise(function(resolve, reject) {
        var headers = buildHeaders();
        if (!headers) {
            resolve({ needSign: false });
            return;
        }
        
        var options = {
            url: 'https://mapi.xmcimg.com/bbs/memcp.php',
            headers: headers,
            body: 'action=getcredit&_tpl=app&target=1',
            timeout: 30
        };
        
        log('开始获取签到信息...');
        
        httpPost(options, function(error, response, data) {
            if (error) {
                log('请求出错: ' + error);
                notify(scriptName, '❌请求失败', '网络错误: ' + error);
                resolve({ needSign: false });
                return;
            }
            
            var statusCode = response ? (response.status || response.statusCode) : 0;
            log('响应状态码: ' + statusCode);
            
            if (statusCode == 404) {
                notify(scriptName, '签到网址404', '可能是服务器临时维护');
                resolve({ needSign: false });
                return;
            }
            
            if (!data) {
                notify(scriptName, '❌签到失败', '服务器返回空数据');
                resolve({ needSign: false });
                return;
            }
            
            // 【核心匹配逻辑 - 仅使用ASCII模式，不依赖中文】
            
            // 1. 尝试提取 formhash（纯ASCII标签属性）
            //    匹配: <input type="hidden" name="formhash" value="xxxx">
            //    或:   id="formhash" value="xxxx"
            var formhashResult = data.match(/name="formhash"\s+value="([a-f0-9]+)"/i) 
                              || data.match(/id="formhash"\s+value="([a-f0-9]+)"/i)
                              || data.match(/value="([a-f0-9]+)"\s+(?:name|id)="formhash"/i);
            
            // 2. 检查是否有 creditsubmit 表单（签到按钮，纯ASCII）
            var hasSubmitBtn = /name="creditsubmit"/i.test(data) 
                            || /creditsubmit/i.test(data);
            
            // 3. 检查 <em>数字</em> 模式（金币数，纯ASCII标签）
            var coinResult = data.match(/<em>(\d+)<\/em>/i);
            
            if (debugMode) {
                log('formhash匹配: ' + (formhashResult ? formhashResult[1] : 'null'));
                log('签到按钮: ' + hasSubmitBtn);
                log('金币匹配: ' + (coinResult ? coinResult[1] : 'null'));
            }
            
            if (formhashResult && hasSubmitBtn) {
                // 找到formhash和签到按钮 → 需要签到
                log('✅已找到formhash: ' + formhashResult[1] + '，准备签到');
                resolve({ needSign: true, formhash: formhashResult[1] });
            } else if (coinResult) {
                // 找到金币信息 → 已经签到过了
                log('已签到，获得金币: ' + coinResult[1]);
                notify(scriptName, '', '重复签到，今日已获得金币' + coinResult[1]);
                resolve({ needSign: false });
            } else if (formhashResult) {
                // 只找到formhash但没有签到按钮，也尝试签到
                log('✅找到formhash: ' + formhashResult[1] + '，尝试签到');
                resolve({ needSign: true, formhash: formhashResult[1] });
            } else {
                // 都没找到
                log('找不到formhash，页面可能已变更或cookie失效');
                log('返回内容前300字: ' + data.substring(0, 300));
                notify(scriptName, '❌签到异常', 'cookie可能已失效或页面结构已变更，请重新获取Cookie');
                resolve({ needSign: false });
            }
        });
    });
}
function checkin(formhash) {
    return new Promise(function(resolve, reject) {
        var headers = buildHeaders();
        if (!headers) {
            resolve();
            return;
        }
        
        var options = {
            url: 'https://mapi.xmcimg.com/bbs/memcp.php?action=getcredit',
            headers: headers,
            body: 'getmode=1&creditsubmit=1&formhash=' + formhash,
            timeout: 30
        };
        
        log('开始签到，formhash=' + formhash);
        
        httpPost(options, function(error, response, data) {
            if (error) {
                log('签到请求出错: ' + error);
                notify(scriptName, '❌签到请求失败', '网络错误: ' + error);
                resolve();
                return;
            }
            
            log('签到响应状态码: ' + (response ? (response.status || response.statusCode) : 'null'));
            
            if (data) {
                // 使用纯ASCII的 <em>数字</em> 模式匹配金币数
                var coinResult = data.match(/<em>(\d+)<\/em>/i);
                
                if (coinResult) {
                    log('✅签到成功，获得金币: ' + coinResult[1]);
                    notify(scriptName, '✅签到成功', '获得金币' + coinResult[1]);
                } else {
                    log('签到已执行，但无法从响应中解析金币数');
                    log('签到响应前300字: ' + data.substring(0, 300));
                    // 检查是否包含成功的标记（ASCII可检测的）
                    if (data.indexOf('formhash') === -1 && data.indexOf('creditsubmit') === -1) {
                        // 签到表单消失了，说明签到可能成功了
                        notify(scriptName, '✅签到可能成功', '签到已执行，请在App中确认结果');
                    } else {
                        notify(scriptName, '⚠️签到结果未知', '请在App中确认签到状态');
                    }
                }
            } else {
                notify(scriptName, '❌签到失败', '服务器返回空数据');
            }
            resolve();
        });
    });
}
// ============== 主流程 ==============
!(async () => {
    log('脚本开始运行');
    log('运行环境: ' + (isSurge ? 'Surge' : isQuanX ? 'QuanX' : isLoon ? 'Loon' : 'Unknown'));
    
    // 判断是获取cookie模式还是签到模式
    if (getCookie()) {
        return; // getCookie内部已调用done
    }
    
    // 签到模式
    log('进入签到模式');
    var result = await getHashcode();
    
    if (result && result.needSign) {
        await checkin(result.formhash);
    }
    
    log('脚本执行完毕');
    done({});
})().catch(function(e) {
    log('❌ 脚本执行失败! 原因: ' + e);
    notify(scriptName, '❌脚本执行失败', String(e));
    done({});
});
