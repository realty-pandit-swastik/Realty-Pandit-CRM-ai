import WebSocket from 'ws';
let msgId = 1;
async function cdp(ws, method, params = {}) {
    const id = msgId++;
    return new Promise((resolve, reject) => {
        const handler = (data) => { const msg = JSON.parse(data.toString()); if (msg.id === id) { ws.off('message', handler); resolve(msg.result); } };
        ws.on('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
        setTimeout(() => { ws.off('message', handler); reject(new Error('timeout')); }, 30000);
    });
}
(async () => {
    const resp = await fetch('http://localhost:9222/json');
    const targets = await resp.json();
    const page = targets.find(t => t.type === 'page' && t.url.includes('realtypandit'));
    if (!page) { console.log('No page found'); return; }
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(r => ws.on('open', r));
    const jsCode = `(async function() {
        const API = 'https://api.realtypandit.in';
        const log = [];
        try {
            const startRes = await fetch(API + '/api/chat/start', {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
            const sid = (await startRes.json()).session_id;
            log.push('Session: ' + sid);
            
            async function send(payload) {
                const res = await fetch(API + '/api/chat/message', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:sid,...payload})});
                const text = await res.text();
                let data;
                try { data = JSON.parse(text); } catch(e) { return {error: 'JSON parse error: ' + text.substring(0,200), status: res.status}; }
                if (!data.messages || data.messages.length === 0) return {error: 'No messages', raw: text.substring(0,200)};
                const last = data.messages[data.messages.length - 1];
                return {stepId:last.step_id||'',inputType:last.input_type||'',qr:last.quick_replies||[],content:(last.content||'').substring(0,100),type:last.type,metadata:last.metadata,active:data.session_active};
            }
            
            // Walk through all steps
            let r;
            r = await send({quick_reply_value:'PROPERTY_OWNER'}); log.push('1.Owner -> ' + r.stepId);
            r = await send({text:'Sunny Test'}); log.push('2.Name -> ' + r.stepId);
            r = await send({text:'9876543210'}); log.push('3.Phone -> ' + r.stepId);
            r = await send({quick_reply_value:'sell'}); log.push('4.Intent -> ' + r.stepId);
            r = await send({quick_reply_value:'residential'}); log.push('5.Category -> ' + r.stepId + ' opts:' + r.qr.map(x=>x.label));
            
            const aptVal = r.metadata.options[0].value;
            r = await send({quick_reply_value: aptVal}); log.push('6.SubType -> ' + r.stepId + ' opts:' + r.qr.map(x=>x.label));
            
            const bhk = r.metadata.options.find(o => o.label === '2 BHK');
            r = await send({quick_reply_value: bhk.value}); log.push('7.Config -> ' + r.stepId + ' type:' + r.inputType);
            
            const addr = {flat_no:'A-101',floor_number:'10',apartment_name:'Test Society',sub_locality:'Sector 150',locality:'Noida',district:'Gautam Buddh Nagar',state:'Uttar Pradesh',pincode:'201310'};
            r = await send({quick_reply_value: JSON.stringify(addr)}); log.push('8.Addr -> ' + r.stepId);
            
            r = await send({quick_reply_value:'UPLOADER'}); log.push('9.Key -> ' + r.stepId);
            r = await send({quick_reply_value:'__skip__'}); log.push('10.PhotoSkip -> ' + r.stepId);
            r = await send({quick_reply_value:'__skip__'}); log.push('11.VideoSkip -> ' + r.stepId + ' type:' + r.type + ' summary:' + !!(r.metadata&&r.metadata.summary));
            
            // NOW CONFIRM - this is where it fails
            log.push('--- CONFIRMING ---');
            const confirmRes = await fetch(API + '/api/chat/confirm', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({session_id:sid, confirmed:true})
            });
            const confirmText = await confirmRes.text();
            log.push('Confirm status: ' + confirmRes.status);
            log.push('Confirm response: ' + confirmText.substring(0, 500));
            
        } catch(e) {
            log.push('ERROR: ' + e.message + ' ' + e.stack);
        }
        return JSON.stringify(log, null, 2);
    })()`;
    const result = await cdp(ws, 'Runtime.evaluate', { expression: jsCode, returnByValue: true, awaitPromise: true });
    console.log(result.result.value);
    ws.close();
})().catch(console.error);
