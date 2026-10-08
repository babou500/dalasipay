(function(){
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const today=()=>new Date().toISOString().slice(0,10);
const addDays=(iso,n)=>{const d=new Date(iso+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const monthEnd=p=>{const [y,m]=String(p).split('-').map(Number);return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10)};
const monthlyDue=p=>addDays(monthEnd(p),15);
const daysBetween=(a,b)=>Math.round((new Date(b+'T00:00:00Z')-new Date(a+'T00:00:00Z'))/86400000);
function config(state){return Object.assign({paye:true,fringeBenefit:false,withholding:false},state.taxComplianceConfig||{});}
function record(state,key){return (state.taxComplianceRecords||[]).find(x=>x.key===key&&x.status==='Complete')||null;}
function payrollExists(state,period){return (state.runs||[]).some(x=>x.period===period&&['Approved','Paid','Closed'].includes(x.status));}
function obligations(state,year){
 year=String(year||String(state.currentPeriod||today()).slice(0,4));const cfg=config(state),out=[];
 for(let m=1;m<=12;m++){
   const period=year+'-'+String(m).padStart(2,'0'),due=monthlyDue(period);
   if(window.DalasiTax?.settings?.(state)?.vatRegistered){
     const filed=!!window.DalasiTax.returnRecord(state,period);
     out.push({key:'vat:'+period,type:'VAT',period,title:'VAT return',due,status:filed?'Complete':'Open',automatic:true,detail:filed?'Filed in DalasiPay':'Monthly GRA VAT return',action:'vat'});
   }
   if(cfg.paye&&payrollExists(state,period)){
     const rec=record(state,'paye:'+period);
     out.push({key:'paye:'+period,type:'PAYE',period,title:'PAYE schedule',due,status:rec?'Complete':'Open',record:rec,detail:rec?'Evidence recorded':'Monthly PAYE schedule',action:'manual'});
   }
   if(cfg.fringeBenefit){
     const rec=record(state,'fbt:'+period);
     out.push({key:'fbt:'+period,type:'Fringe Benefit Tax',period,title:'Fringe Benefit Tax return',due,status:rec?'Complete':'Open',record:rec,detail:rec?'Evidence recorded':'Monthly GRA return',action:'manual'});
   }
   if(cfg.withholding){
     const rec=record(state,'wht:'+period);
     out.push({key:'wht:'+period,type:'Withholding Tax',period,title:'Withholding Tax schedule',due,status:rec?'Complete':'Open',record:rec,detail:rec?'Evidence recorded':'Monthly GRA schedule',action:'manual'});
   }
 }
 [['Q1',year+'-04-15'],['Q2',year+'-07-15'],['Q3',year+'-10-15'],['Q4',(Number(year)+1)+'-01-15']].forEach(([q,due])=>{
   const paid=(state.corporateTaxPayments||[]).some(x=>String(x.year)===year&&x.quarter===q),rec=record(state,'cit-'+q.toLowerCase()+':'+year);
   out.push({key:'cit-'+q.toLowerCase()+':'+year,type:'Corporate Tax',period:q,title:'Corporate tax '+q+' declaration / instalment',due,status:(paid||rec)?'Complete':'Open',record:rec,automatic:paid,detail:paid?'Corporate tax payment recorded':rec?'Declaration evidence recorded':'Quarterly GRA declaration',action:'corporate'});
 });
 const cit=window.DalasiCorporateTax?.returnRecord?.(state,year),due=(Number(year)+1)+'-03-31';
 out.push({key:'cit-annual:'+year,type:'Corporate Tax',period:year,title:'Annual Corporate Income Tax return',due,status:cit?.status==='Filed'?'Complete':'Open',automatic:true,detail:cit?.status==='Filed'?'Filed · '+(cit.acknowledgementId||'acknowledgement recorded'):'Annual GRA return',action:'corporate'});
 return out.sort((a,b)=>String(a.due).localeCompare(String(b.due))||a.title.localeCompare(b.title));
}
function decorate(o){
 const now=today(),days=daysBetween(now,o.due);if(o.status==='Complete')return {...o,days,statusLabel:'Complete',tone:'ready'};
 if(days<0)return {...o,days,statusLabel:'Overdue '+Math.abs(days)+'d',tone:'review'};
 if(days===0)return {...o,days,statusLabel:'Due today',tone:'approved'};
 if(days<=7)return {...o,days,statusLabel:'Due in '+days+'d',tone:'approved'};
 if(days<=30)return {...o,days,statusLabel:'Upcoming · '+days+'d',tone:'neutral'};
 return {...o,days,statusLabel:'Scheduled',tone:'neutral'};
}
function render(state,h){
 const {pageTitle,icon,pill}=h,year=String(state.taxComplianceYear||String(state.currentPeriod||today()).slice(0,4)),items=obligations(state,year).map(decorate),open=items.filter(x=>x.status!=='Complete'),overdue=open.filter(x=>x.days<0),next=open.filter(x=>x.days>=0).sort((a,b)=>a.days-b.days)[0],cfg=config(state);
 const opts=[Number(year)-1,Number(year),Number(year)+1].map(y=>'<option value="'+y+'" '+(String(y)===year?'selected':'')+'>'+y+'</option>').join('');
 const rows=items.map(x=>'<tr><td><div class="payment-payee"><b>'+esc(x.title)+'</b><small>'+esc(x.type)+' · '+esc(x.period)+'</small></div></td><td>'+esc(x.due)+'</td><td>'+pill(x.statusLabel,x.tone)+'</td><td>'+esc(x.detail)+'</td><td>'+(x.status==='Complete'?(x.record?'<button class="secondary tiny" data-action="tax-compliance-reopen:'+esc(x.key)+'">Reopen</button>':'<button class="secondary tiny" data-action="tax-compliance-open:'+esc(x.action)+':'+esc(x.period)+'">View</button>'):'<div class="inline-buttons"><button class="secondary tiny" data-action="tax-compliance-open:'+esc(x.action)+':'+esc(x.period)+'">Open</button>'+(!x.automatic&&x.action==='manual'?'<button class="primary tiny" data-action="open-tax-compliance-complete:'+esc(x.key)+'">Mark complete</button>':(x.action==='corporate'&&x.period.startsWith('Q')?'<button class="primary tiny" data-action="open-tax-compliance-complete:'+esc(x.key)+'">Evidence</button>':''))+'</div>')+'</td></tr>').join('');
 return pageTitle('TAX COMPLIANCE','Compliance Calendar','GRA filing and payment deadlines with evidence tracking and overdue alerts.','<div class="inline-buttons"><button class="secondary" data-action="tax-view:vat">VAT</button><button class="secondary" data-action="tax-view:corporate">Corporate Tax</button><select id="tax-compliance-year">'+opts+'</select><button class="secondary" data-action="open-tax-compliance-settings">'+icon('settings',14)+' Obligations</button><button class="secondary" data-action="tax-compliance-export">'+icon('download',14)+' CSV</button></div>')+
 '<div class="accounting-summary"><div class="surface"><span>Open obligations</span><b>'+open.length+'</b><small>'+year+'</small></div><div class="surface '+(overdue.length?'cash-alert':'')+'"><span>Overdue</span><b>'+overdue.length+'</b><small>'+(overdue.length?'requires attention':'none overdue')+'</small></div><div class="surface"><span>Next deadline</span><b>'+esc(next?.due||'—')+'</b><small>'+esc(next?.title||'No open deadlines')+'</small></div><div class="surface"><span>Completed</span><b>'+items.filter(x=>x.status==='Complete').length+'</b><small>evidence / filing recorded</small></div></div>'+
 (overdue.length?'<div class="payment-notice"><span>'+icon('alert',17)+'</span><div><b>'+overdue.length+' tax obligation'+(overdue.length===1?' is':'s are')+' overdue</b><p>'+esc(overdue.slice(0,3).map(x=>x.title+' ('+x.due+')').join(' · '))+'</p></div></div>':'')+
 '<section class="surface employee-card"><div class="table-tools"><div><h3>'+esc(year)+' compliance schedule</h3><p>Deadlines are based on current GRA filing guidance. Completion records store evidence; they do not submit to GRA.</p></div></div><div class="table-scroll"><table><thead><tr><th>OBLIGATION</th><th>DUE DATE</th><th>STATUS</th><th>EVIDENCE</th><th>ACTION</th></tr></thead><tbody>'+rows+'</tbody></table></div></section>';
}
function settingsModal(state,h){const cfg=config(state),{icon}=h;return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-tax-compliance-settings"></div><form id="tax-compliance-settings-form" class="modal-box"><div class="modal-head"><div><h2>Compliance obligations</h2><p>Enable only tax schedules that apply to this business.</p></div><button type="button" class="close" data-action="close-tax-compliance-settings">×</button></div><div class="notification-settings"><label><input name="paye" type="checkbox" '+(cfg.paye?'checked':'')+'> PAYE schedule when payroll exists</label><label><input name="fringeBenefit" type="checkbox" '+(cfg.fringeBenefit?'checked':'')+'> Fringe Benefit Tax monthly return</label><label><input name="withholding" type="checkbox" '+(cfg.withholding?'checked':'')+'> Withholding Tax monthly schedule</label></div><div class="modal-note">VAT is included automatically when the business is VAT registered. Corporate income tax quarterly and annual obligations are always shown.</div><div class="modal-actions"><button class="primary" type="submit">'+icon('check',14)+' Save obligations</button></div></form></div>'}
function saveSettings(ev,state,ctx){ev.preventDefault();const fd=new FormData(ev.target);state.taxComplianceConfig={paye:fd.has('paye'),fringeBenefit:fd.has('fringeBenefit'),withholding:fd.has('withholding')};state.taxComplianceSettingsOpen=false;ctx.audit('tax.compliance_settings_updated',state.taxComplianceConfig);ctx.save();ctx.render();}
function completeModal(state,h){const key=state.taxComplianceCompleteKey;if(!key)return '';const item=obligations(state,state.taxComplianceYear).find(x=>x.key===key);if(!item)return '';const {field,icon}=h;return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-tax-compliance-complete"></div><form id="tax-compliance-complete-form" class="modal-box"><div class="modal-head"><div><h2>Record compliance evidence</h2><p>'+esc(item.title)+' · due '+esc(item.due)+'</p></div><button type="button" class="close" data-action="close-tax-compliance-complete">×</button></div><input type="hidden" name="key" value="'+esc(key)+'"><div class="form-grid">'+field('Completed / filed date','<input name="date" type="date" value="'+today()+'" required>')+field('GRA reference / document ID','<input name="reference" required placeholder="Acknowledgement, receipt or document ID">')+field('Evidence note','<textarea name="note" rows="3" required placeholder="What was filed or paid"></textarea>')+'</div><div class="modal-actions"><button type="button" class="secondary" data-action="close-tax-compliance-complete">Cancel</button><button class="primary" type="submit">'+icon('check',14)+' Record completion</button></div></form></div>'}
function saveCompletion(ev,state,ctx){ev.preventDefault();const fd=new FormData(ev.target),key=String(fd.get('key')||''),reference=String(fd.get('reference')||'').trim(),note=String(fd.get('note')||'').trim(),date=String(fd.get('date')||'');if(!key||!date||!reference||note.length<3){ctx.toast('Enter the completion date, GRA reference and evidence note.');return;}state.taxComplianceRecords=state.taxComplianceRecords||[];state.taxComplianceRecords.unshift({id:'TCR-'+Date.now().toString(36).toUpperCase(),key,status:'Complete',date,reference,note,completedAt:new Date().toISOString(),completedBy:state.session?.name||'User'});state.taxComplianceCompleteKey=null;ctx.audit('tax.compliance_completed',{key,date,reference});ctx.save();ctx.render();}
function reopen(key,state,ctx){const rec=record(state,key);if(!rec)return;rec.status='Reopened';rec.reopenedAt=new Date().toISOString();rec.reopenedBy=state.session?.name||'User';ctx.audit('tax.compliance_reopened',{key,recordId:rec.id});ctx.save();ctx.render();}
function exportCsv(state,ctx){const year=String(state.taxComplianceYear||String(state.currentPeriod||today()).slice(0,4)),rows=[['Tax Compliance Calendar',year],[],['Type','Period','Obligation','Due date','Status','Reference','Completed by','Completed at'],...obligations(state,year).map(x=>{const d=decorate(x),r=x.record||record(state,x.key);return [x.type,x.period,x.title,x.due,d.statusLabel,r?.reference||'',r?.completedBy||'',r?.completedAt||'']})];const csv=rows.map(r=>r.map(v=>{const q=String(v??'');return /[",\n]/.test(q)?'"'+q.replace(/"/g,'""')+'"':q}).join(',')).join('\n');ctx.downloadText('dalasipay-tax-compliance-calendar-'+year+'.csv',csv);ctx.toast('Tax compliance calendar downloaded');}
window.DalasiTaxCompliance={config,record,obligations,render,settingsModal,saveSettings,completeModal,saveCompletion,reopen,exportCsv};
})();