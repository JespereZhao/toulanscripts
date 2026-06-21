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
    if (isSurge) {
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
    } else if (isLoon) {
        $httpClient.post(options, function(error, response, data) {
            if (response) {
                response.statusCode = response.status;
            }
            callback(error, response, data);
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
        if (debugMode) log('请求参数: ' + JSON.stringify(options));
        
        httpPost(options, function(error, response, data) {
            if (error) {
                log('请求出错: ' + error);
                notify(scriptName, '❌请求失败', '网络错误: ' + error);
                resolve({ needSign: false });
                return;
            }
            
            var statusCode = response ? (response.status || response.statusCode) : 0;
            log('响应状态码: ' + statusCode);
            if (debugMode) log('响应内容: ' + (data ? data.substring(0, 500) : 'null'));
            
            if (statusCode == 404) {
                log('签到网址404，找不到相关信息');
                notify(scriptName, '签到网址404', '可能是服务器临时维护，若持续多天无法签到，请联系Github@toulanboy');
                resolve({ needSign: false });
                return;
            }
            
            if (!data) {
                log('响应数据为空');
                notify(scriptName, '❌签到失败', '服务器返回空数据，cookie可能已失效');
                resolve({ needSign: false });
                return;
            }
            
            if (data.match(/点击拆红包/)) {
                var result = data.match(/id=\"formhash\" value=\"(.*?)\"/);
                if (result) {
                    log('✅已找到formhash: ' + result[1]);
                    resolve({ needSign: true, formhash: result[1] });
                } else {
                    log('找不到formhash，cookie可能已失效');
                    notify(scriptName, '找不到formhash', 'cookie可能已失效，请重新获取。');
                    resolve({ needSign: false });
                }
            } else if (data.match(/已连续/)) {
                var coin = data.match(/<em>(\d+?)<\/em>/);
                var otherMsg = data.match(/已连续.*?(\d+).*?天领取，连续.*?(\d+).*?天得大礼包/);
                var msg = '重复签到';
                if (coin && otherMsg) {
                    msg = '重复签到，签到情况如下：\n1️⃣获得金币' + coin[1] + '\n2️⃣' + otherMsg[0];
                }
                notify(scriptName, '', msg);
                resolve({ needSign: false });
            } else {
                log('找不到相关信息，返回内容前200字: ' + data.substring(0, 200));
                notify(scriptName, '❌签到异常', 'cookie可能已失效，请重新获取。');
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
        
        log('开始签到...');
        
        httpPost(options, function(error, response, data) {
            if (error) {
                log('签到请求出错: ' + error);
                notify(scriptName, '❌签到请求失败', '网络错误: ' + error);
                resolve();
                return;
            }
            
            if (debugMode) log('签到响应: ' + (data ? data.substring(0, 500) : 'null'));
            
            if (data) {
                var coin = data.match(/<em>(\d+?)<\/em>/);
                var otherMsg = data.match(/已连续.*?(\d+).*?天领取，连续.*?(\d+).*?天得大礼包/);
                if (coin && otherMsg) {
                    notify(scriptName, '', '✅签到成功，签到情况如下：\n1️⃣获得金币' + coin[1] + '\n2️⃣' + otherMsg[0]);
                } else {
                    log('签到响应格式不匹配');
                    notify(scriptName, '签到结果', '签到已执行，但无法解析结果');
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
