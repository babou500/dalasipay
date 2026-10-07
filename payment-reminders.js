(function(){
  'use strict';

  const DEFAULTS={enabled:true,dueSoonDays:3,overdue1Days:7,overdue2Days:14,overdue3Days:30,defaultChannel:'Email',autoPrepare:true};
  const todayIso=()=>new Date().toISOString().slice(0,10);
  const round=n=>Math.round((Number(n)||0)*100)/100;
  function addDays(date,days){const d=new Date((date||todayIso())+'T12:00:00');d.setDate(d.getDate()+(Number(days)||0));return d.toISOString().slice(0,10);}
  function daysDiff(a,b){const A=new Date(a+'T12:00:00'),B=new Date(b+'T12:00:00');return Math.round((B-A)/86400000);}
  function customerById(state,id){return (state.customers||[]).find(x=>x.id===id)||null;}
  function invoiceById(state,id){return (state.customerInvoices||[]).find(x=>x.id===id)||null;}
  function config(state){return Object.assign({},DEFAULTS,state.paymentReminderSettings||{});}
  function balance(state,inv){return window.DalasiReturns?.invoiceBalance?.(state,inv)??Math.max(0,(Number(inv.amount)||0)-((state.incomingPayments||[]).filter(x=>x.invoiceId===inv.id).reduce((a,x)=>a+(Number(x.amount)||0),0)));}
  function invStatus(state,inv){return window.DalasiSalesInvoices?.status?.(state,inv)||(inv.status||'Draft');}
  function stageFor(state,inv,asOf=todayIso()){
    if(!inv||['Draft','Paid'].includes(invStatus(state,inv))||balance(state,inv)<=.004)return null;
    const cfg=config(state),due=String(inv.dueDate||inv.issueDate||asOf),delta=daysDiff(asOf,due);
    if(delta===cfg.dueSoonDays)return {key:'due-soon',label:'Due soon',priority:1};
    if(delta===0)return {key:'due-today',label:'Due today',priority:2};
    const overdue=Math.max(0,-delta);
    if(overdue===Number(cfg.overdue1Days))return {key:'overdue-1',label:overdue+' days overdue',priority:3};
    if(overdue===Number(cfg.overdue2Days))return {key:'overdue-2',label:overdue+' days overdue',priority:4};
    if(overdue===Number(cfg.overdue3Days))return {key:'overdue-3',label:overdue+' days overdue',priority:5};
    return null;
  }
  function latestStage(state,inv,asOf=todayIso()){
    if(!inv||['Draft','Paid'].includes(invStatus(state,inv))||balance(state,inv)<=.004)return null;
    const cfg=config(state),due=String(inv.dueDate||inv.issueDate||asOf),delta=daysDiff(asOf,due),overdue=Math.max(0,-delta);
    if(overdue>=Number(cfg.overdue3Days))return {key:'overdue-3',label:overdue+' days overdue',priority:5};
    if(overdue>=Number(cfg.overdue2Days))return {key:'overdue-2',label:overdue+' days overdue',priority:4};
    if(overdue>=Number(cfg.overdue1Days))return {key:'overdue-1',label:overdue+' days overdue',priority:3};
    if(delta<=0)return {key:'due-today',label:delta===0?'Due today':overdue+' days overdue',priority:2};
    if(delta<=Number(cfg.dueSoonDays))return {key:'due-soon',label:'Due in '+delta+' day'+(delta===1?'':'s'),priority:1};
    return null;
  }
  function reminderKey(invoiceId,stageKey){return invoiceId+'|'+stageKey;}
  function customerContact(state,inv){
    const c=inv.customerId?customerById(state,inv.customerId):null;
    return {email:inv.customerEmail||c?.email||'',phone:inv.customerPhone||c?.phone||'',name:inv.customerName||c?.name||'Customer'};
  }
  function message(state,inv,stage){
    const b=balance(state,inv),company=state.company||'DalasiPay Workspace',due=inv.dueDate||inv.issueDate||'',money='D'+round(b).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
    const intro=stage.key==='due-soon'?'This is a friendly reminder that your invoice is due soon.':stage.key==='due-today'?'This is a reminder that your invoice is due today.':'Our records show that this invoice is now overdue.';
    return 'Dear '+(inv.customerName||'Customer')+',\n\n'+intro+'\n\nInvoice: '+(inv.invoiceNo||inv.id)+'\nAmount outstanding: '+money+'\nDue date: '+due+'\n\nPlease arrange payment at your earliest convenience or contact us if there is any issue with this invoice.\n\nThank you,\n'+company;
  }
  function materialize(state,ctx){
    const cfg=config(state);if(!cfg.enabled)return 0;
    state.paymentReminders=state.paymentReminders||[];
    let added=0;
    (state.customerInvoices||[]).forEach(inv=>{
      const st=stageFor(state,inv);if(!st)return;
      const key=reminderKey(inv.id,st.key);if(state.paymentReminders.some(x=>x.key===key))return;
      const contact=customerContact(state,inv);
      state.paymentReminders.unshift({id:'RMD-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,5).toUpperCase(),key,invoiceId:inv.id,invoiceNo:inv.invoiceNo||inv.id,customerId:inv.customerId||'',customerName:contact.name,email:contact.email,phone:contact.phone,stageKey:st.key,stageLabel:st.label,priority:st.priority,balance:round(balance(state,inv)),dueDate:inv.dueDate||'',channel:cfg.defaultChannel||'Email',message:message(state,inv,st),status:cfg.autoPrepare?'Prepared':'Queued',createdAt:new Date().toISOString(),preparedAt:cfg.autoPrepare?new Date().toISOString():'',createdBy:'DalasiPay reminder engine'});
      added++;
      ctx?.audit?.('payment_reminder.created',{invoiceId:inv.id,invoiceNo:inv.invoiceNo||inv.id,stage:st.key,balance:round(balance(state,inv))});
    });
    return added;
  }
  function summary(state){
    const rows=state.paymentReminders||[],open=rows.filter(x=>!['Sent','Cancelled','Resolved'].includes(x.status||'Queued'));
    return {total:rows.length,open:open.length,prepared:open.filter(x=>x.status==='Prepared').length,overdue:open.filter(x=>String(x.stageKey).startsWith('overdue')).length,sent:rows.filter(x=>x.status==='Sent').length};
  }
  function panel(state,h){
    const cfg=config(state),m=summary(state),icon=h.icon,money2=h.money2,esc=h.esc;
    const rows=(state.paymentReminders||[]).slice().sort((a,b)=>(Number(b.priority)||0)-(Number(a.priority)||0)||String(b.createdAt||'').localeCompare(String(a.createdAt||''))).slice(0,30);
    const table=rows.length?rows.map(r=>{
      const inv=invoiceById(state,r.invoiceId),current=inv?latestStage(state,inv):null,st=r.status||'Queued';
      return '<tr><td><div class="payment-payee"><b>'+esc(r.customerName||'Customer')+'</b><small>'+esc(r.invoiceNo||r.invoiceId)+'</small></div></td><td>'+money2(inv?balance(state,inv):r.balance)+'</td><td><b>'+esc(current?.label||r.stageLabel||'Reminder')+'</b><small class="table-sub">Due '+esc(r.dueDate||'—')+'</small></td><td>'+h.pill(st,st==='Sent'?'paid':st==='Prepared'?'approved':st==='Cancelled'?'neutral':'ready')+'</td><td>'+esc(r.channel||'Email')+'</td><td><div class="reminder-actions">'+
        '<button class="secondary tiny" data-action="reminder-preview:'+r.id+'">Preview</button>'+
        (st!=='Sent'?'<button class="secondary tiny" data-action="reminder-copy:'+r.id+'">Copy</button>':'')+
        (st!=='Sent'&&r.email?'<button class="secondary tiny" data-action="reminder-email:'+r.id+'">Email</button>':'')+
        (st!=='Sent'&&r.phone?'<button class="secondary tiny" data-action="reminder-whatsapp:'+r.id+'">WhatsApp</button>':'')+
        (st!=='Sent'?'<button class="text-btn" data-action="reminder-mark-sent:'+r.id+'">Mark sent</button>':'')+
      '</div></td></tr>';
    }).join(''):'<tr><td colspan="6"><div class="empty-inline">No payment reminders are currently queued. DalasiPay will prepare them as invoices reach the configured reminder stages.</div></td></tr>';
    return '<section class="surface reminder-automation">'+
      '<div class="reminder-head"><div><div class="eyebrow">AUTOMATIC COLLECTIONS</div><h3>Payment reminders & overdue follow-ups</h3><p>Prepare customer reminders from live invoice due dates without creating duplicates.</p></div><div class="inline-buttons"><span class="reminder-engine '+(cfg.enabled?'on':'off')+'">'+(cfg.enabled?'Automation on':'Automation off')+'</span><button class="secondary" data-action="reminder-run">'+icon('refresh',13)+' Check now</button><button class="secondary" data-action="open-reminder-settings">'+icon('settings',13)+' Settings</button></div></div>'+
      '<div class="reminder-kpis"><div><span>Open reminders</span><b>'+m.open+'</b></div><div><span>Prepared</span><b>'+m.prepared+'</b></div><div><span>Overdue follow-ups</span><b>'+m.overdue+'</b></div><div><span>Sent history</span><b>'+m.sent+'</b></div></div>'+
      '<div class="reminder-rule-line"><span>Rules</span><b>'+cfg.dueSoonDays+' days before due</b><b>Due date</b><b>'+cfg.overdue1Days+' days overdue</b><b>'+cfg.overdue2Days+' days overdue</b><b>'+cfg.overdue3Days+' days overdue</b></div>'+
      '<div class="table-scroll"><table class="reminder-table"><thead><tr><th>CUSTOMER / INVOICE</th><th>BALANCE</th><th>STAGE</th><th>STATUS</th><th>CHANNEL</th><th>ACTION</th></tr></thead><tbody>'+table+'</tbody></table></div>'+
      '<div class="reminder-disclaimer"><b>Delivery control:</b> DalasiPay prepares reminders automatically. Email and WhatsApp open the customer message for review before sending, so the system does not falsely claim external delivery occurred.</div>'+
    '</section>';
  }
  function settingsModal(state,h){
    const cfg=config(state),field=h.field,icon=h.icon;
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-reminder-settings"></div><form id="reminder-settings-form" class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">COLLECTION AUTOMATION</div><h2>Payment reminder settings</h2><p>Choose when DalasiPay should prepare customer payment reminders.</p></div><button type="button" class="close" data-action="close-reminder-settings">×</button></div>'+
      '<div class="form-grid">'+
        field('Automation','<select name="enabled"><option value="true" '+(cfg.enabled?'selected':'')+'>Enabled</option><option value="false" '+(!cfg.enabled?'selected':'')+'>Disabled</option></select>')+
        field('Default channel','<select name="defaultChannel"><option '+(cfg.defaultChannel==='Email'?'selected':'')+'>Email</option><option '+(cfg.defaultChannel==='WhatsApp'?'selected':'')+'>WhatsApp</option><option '+(cfg.defaultChannel==='Manual'?'selected':'')+'>Manual</option></select>')+
        field('Friendly reminder before due','<input name="dueSoonDays" type="number" min="1" max="30" value="'+cfg.dueSoonDays+'">')+
        field('First overdue reminder','<input name="overdue1Days" type="number" min="1" max="90" value="'+cfg.overdue1Days+'">')+
        field('Second overdue reminder','<input name="overdue2Days" type="number" min="1" max="120" value="'+cfg.overdue2Days+'">')+
        field('Final overdue escalation','<input name="overdue3Days" type="number" min="1" max="365" value="'+cfg.overdue3Days+'">')+
        field('New reminders','<select name="autoPrepare"><option value="true" '+(cfg.autoPrepare?'selected':'')+'>Prepare automatically</option><option value="false" '+(!cfg.autoPrepare?'selected':'')+'>Queue for review</option></select>')+
      '</div>'+
      '<div class="modal-note">Reminder stages must increase in order. Existing reminder history is retained when settings change.</div>'+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-reminder-settings">Cancel</button><button class="primary" type="submit">'+icon('save',14)+' Save settings</button></div></form></div>';
  }
  function previewModal(state,h){
    const r=(state.paymentReminders||[]).find(x=>x.id===state.reminderPreviewId);if(!r)return '';
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-reminder-preview"></div><div class="modal-box reminder-preview-modal"><div class="modal-head"><div><div class="eyebrow">PAYMENT REMINDER</div><h2>'+h.esc(r.customerName||'Customer')+'</h2><p>'+h.esc(r.invoiceNo||r.invoiceId)+' · '+h.esc(r.stageLabel||'Reminder')+'</p></div><button class="close" data-action="close-reminder-preview">×</button></div><div class="reminder-message">'+h.esc(r.message||'').replace(/\n/g,'<br>')+'</div><div class="modal-actions"><button class="secondary" data-action="reminder-copy:'+r.id+'">Copy message</button>'+(r.email?'<button class="secondary" data-action="reminder-email:'+r.id+'">Open email</button>':'')+(r.phone?'<button class="secondary" data-action="reminder-whatsapp:'+r.id+'">Open WhatsApp</button>':'')+(r.status!=='Sent'?'<button class="primary" data-action="reminder-mark-sent:'+r.id+'">Mark as sent</button>':'')+'</div></div></div>';
  }
  function saveSettings(ev,state,ctx){
    ev.preventDefault();if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to change reminder settings.');return;}
    const fd=new FormData(ev.target),a=Number(fd.get('overdue1Days')||7),b=Number(fd.get('overdue2Days')||14),c=Number(fd.get('overdue3Days')||30);
    if(!(a<b&&b<c)){ctx.toast('Overdue reminder stages must increase in order.');return;}
    state.paymentReminderSettings={enabled:String(fd.get('enabled'))==='true',dueSoonDays:Math.max(1,Number(fd.get('dueSoonDays')||3)),overdue1Days:a,overdue2Days:b,overdue3Days:c,defaultChannel:String(fd.get('defaultChannel')||'Email'),autoPrepare:String(fd.get('autoPrepare'))==='true'};
    state.reminderSettingsOpen=false;ctx.audit('payment_reminder.settings_updated',state.paymentReminderSettings);ctx.save();ctx.toast('Payment reminder settings updated');ctx.render();
  }
  function byId(state,id){return (state.paymentReminders||[]).find(x=>x.id===id)||null;}
  function markSent(id,state,ctx,channel){
    const r=byId(state,id);if(!r)return;r.status='Sent';r.channel=channel||r.channel||'Manual';r.sentAt=new Date().toISOString();r.sentBy=state.session?.name||'User';
    state.reminderPreviewId=null;ctx.audit('payment_reminder.marked_sent',{reminderId:id,invoiceId:r.invoiceId,channel:r.channel});ctx.save();ctx.toast('Reminder marked as sent');ctx.render();
  }
  function copy(id,state,ctx){
    const r=byId(state,id);if(!r)return;
    if(navigator.clipboard?.writeText){navigator.clipboard.writeText(r.message||'').then(()=>ctx.toast('Reminder copied')).catch(()=>ctx.toast('Could not copy automatically. Open Preview to copy the message.'));}else ctx.toast('Open Preview to copy the reminder message.');
  }
  function openEmail(id,state,ctx){
    const r=byId(state,id);if(!r||!r.email){ctx.toast('No customer email is saved for this invoice.');return;}
    const subject=encodeURIComponent('Payment reminder · '+(r.invoiceNo||'Invoice')),body=encodeURIComponent(r.message||'');
    window.location.href='mailto:'+encodeURIComponent(r.email)+'?subject='+subject+'&body='+body;
    r.status='Prepared';r.channel='Email';r.lastOpenedAt=new Date().toISOString();ctx.audit('payment_reminder.email_opened',{reminderId:id,invoiceId:r.invoiceId});ctx.save();
  }
  function openWhatsApp(id,state,ctx){
    const r=byId(state,id);if(!r||!r.phone){ctx.toast('No customer phone number is saved for this invoice.');return;}
    const phone=String(r.phone).replace(/[^0-9]/g,'');if(!phone){ctx.toast('Customer phone number is invalid.');return;}
    window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(r.message||''),'_blank','noopener');
    r.status='Prepared';r.channel='WhatsApp';r.lastOpenedAt=new Date().toISOString();ctx.audit('payment_reminder.whatsapp_opened',{reminderId:id,invoiceId:r.invoiceId});ctx.save();
  }
  function runNow(state,ctx){const n=materialize(state,ctx);ctx.save();ctx.toast(n?n+' new payment reminder'+(n===1?'':'s')+' prepared':'No new reminder stage is due today');ctx.render();}
  window.DalasiReminders={DEFAULTS,config,materialize,panel,settingsModal,previewModal,saveSettings,markSent,copy,openEmail,openWhatsApp,runNow,summary};
})();