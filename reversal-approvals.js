(function(){
  'use strict';
  function uid(){return 'RVR-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,5).toUpperCase();}
  function requests(state){state.reversalRequests=state.reversalRequests||[];return state.reversalRequests;}
  function pendingFor(state,sourceType,sourceId){return requests(state).find(x=>x.sourceType===sourceType&&x.sourceId===sourceId&&x.status==='Pending')||null;}
  function request(state,input,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to request a reversal.');return null;}
    if(pendingFor(state,input.sourceType,input.sourceId)){ctx.toast('A reversal request is already pending for this transaction.');return null;}
    const reason=String(input.reason||'').trim();if(reason.length<5){ctx.toast('Enter a clear reversal reason of at least 5 characters.');return null;}
    const now=new Date().toISOString(),actor=state.session?.name||'User',actorId=state.session?.userId||actor;
    const rec={id:uid(),sourceType:input.sourceType,sourceId:input.sourceId,sourceRef:input.sourceRef||input.sourceId,transactionType:input.transactionType||'Transaction',amount:Number(input.amount)||0,reason,status:'Pending',requestedAt:now,requestedBy:actor,requestedByUserId:actorId};
    requests(state).unshift(rec);ctx.audit('reversal.requested',{requestId:rec.id,sourceType:rec.sourceType,sourceId:rec.sourceId,sourceRef:rec.sourceRef,amount:rec.amount,reason});ctx.save();ctx.toast('Reversal request submitted for independent approval');ctx.render();return rec;
  }
  function approve(id,state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to approve reversals.');return;}
    const r=requests(state).find(x=>x.id===id);if(!r||r.status!=='Pending')return;
    const actor=state.session?.name||'User',actorId=state.session?.userId||actor;
    if(String(r.requestedByUserId||r.requestedBy)===String(actorId)){ctx.toast('Maker-checker control: the requester cannot approve their own reversal.');return;}
    const approvedAt=new Date().toISOString();
    const approved={...r,approvedAt,approvedBy:actor,approvedByUserId:actorId};
    let ok=false;
    if(r.sourceType==='business-payment')ok=window.DalasiBusinessPayments?.reversePayment?.(r.sourceId,state,{...ctx,approvedRequest:approved})!==false;
    else if(r.sourceType==='customer-collection')ok=window.DalasiBusinessPayments?.reverseIncomingPayment?.(r.sourceId,state,{...ctx,approvedRequest:approved})!==false;
    else if(r.sourceType==='expense')ok=window.DalasiExpensesPurchases?.reverseExpense?.(r.sourceId,state,{...ctx,approvedRequest:approved})!==false;
    else if(r.sourceType==='manual-journal')ok=window.DalasiAccounting?.reverseJournal?.(r.sourceId,state,{...ctx,approvedRequest:approved})!==false;
    else {ctx.toast('Unsupported reversal request type.');return;}
    if(ok===false)return;
    r.status='Approved';r.approvedAt=approvedAt;r.approvedBy=actor;r.approvedByUserId=actorId;
    ctx.audit('reversal.approved',{requestId:r.id,sourceType:r.sourceType,sourceId:r.sourceId,sourceRef:r.sourceRef,requestedBy:r.requestedBy,approvedBy:actor});ctx.save();ctx.toast(r.sourceRef+' reversal approved and posted');ctx.render();
  }
  function reject(id,state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to reject reversals.');return;}
    const r=requests(state).find(x=>x.id===id);if(!r||r.status!=='Pending')return;
    const actor=state.session?.name||'User',actorId=state.session?.userId||actor;
    if(String(r.requestedByUserId||r.requestedBy)===String(actorId)){ctx.toast('Maker-checker control: the requester cannot reject their own reversal request.');return;}
    const note=String(window.prompt('Reason for rejecting this reversal request?')||'').trim();if(!note)return;
    r.status='Rejected';r.rejectedAt=new Date().toISOString();r.rejectedBy=actor;r.rejectedByUserId=actorId;r.rejectionReason=note;
    ctx.audit('reversal.rejected',{requestId:r.id,sourceType:r.sourceType,sourceId:r.sourceId,sourceRef:r.sourceRef,reason:note});ctx.save();ctx.toast('Reversal request rejected');ctx.render();
  }
  window.DalasiReversalApprovals={requests,pendingFor,request,approve,reject};
})();