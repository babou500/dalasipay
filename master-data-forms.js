(function(){
  'use strict';
  const locks=new WeakMap();
  const errorText=error=>({conflict:'A newer workspace version exists. Refresh after saving your draft, then try again.',offline:'You are offline. Reconnect and retry; this record has not been saved.',permission:'Your workspace access changed. Sign in to the correct workspace and retry.',storage:'Cloud save succeeded, but this browser could not cache it. Refresh before retrying.'}[error?.code]||'Unable to confirm the save to this workspace. Check your connection and permissions, then retry. Your form has been kept.');
  function feedback(form,message){
    let node=form.querySelector('[data-master-feedback]');
    if(!node){node=document.createElement('div');node.dataset.masterFeedback='';node.setAttribute('role','status');node.className='payment-modal-note';form.append(node);}
    node.textContent=String(message||'');
  }
  function context(form,state,base){
    const workspaceId=form.dataset.workspaceId||state.org?.id,userId=state.session?.userId;
    form.dataset.workspaceId=workspaceId||'';form.dataset.userId=userId||'';
    const isCurrent=()=>!!workspaceId&&state.org?.id===workspaceId&&state.session?.userId===userId;
    return {...base,workspaceId,isCurrent,can:p=>isCurrent()&&base.can(p),toast:message=>feedback(form,message),
      persist:async(key,rows,action,metadata)=>{
        if(!isCurrent())throw Object.assign(Error(),{code:'permission'});
        form.dataset.masterBusy='1';form.inert=true;feedback(form,'Saving to this workspace…');
        try{await window.DalasiProduction.commitMasterData(workspaceId,key,rows,{action,metadata});}
        finally{delete form.dataset.masterBusy;form.inert=false;if(state._masterRenderPending){state._masterRenderPending=false;setTimeout(()=>base.render(),0);}}
      }};
  }
  async function create(state,key,ctx,work){
    let active=locks.get(state);if(!active){active=new Set();locks.set(state,active);}
    if(active.has(key)){ctx.toast('A save is already in progress. Please wait.');return null;}
    active.add(key);
    try{return await work();}catch(error){ctx.toast(errorText(error));return null;}finally{active.delete(key);}
  }
  // Work against an isolated draft. Financial state is published only after the
  // revisioned workspace write acknowledges all changed collections together.
  const procurementKeys={businessExpenses:'business-expenses',purchaseOrders:'purchase-orders',businessBills:'business-bills',businessPayments:'business-payments',cashTransactions:'cash-transactions',salesCatalog:'sales-catalog',inventoryMovements:'inventory-movements',reversalRequests:'reversal-requests'};
  async function transaction(form,state,base,work){
    const ctx=context(form,state,base);
    return create(state,'procurement',ctx,async()=>{
      if(!ctx.isCurrent()||!(ctx.can('workspace.manage')||ctx.can('payroll.manage')))throw Object.assign(Error(),{code:'permission'});
      if(form.querySelector('[data-quick-supplier-panel]:not([hidden])')){ctx.toast('Save or cancel the new supplier before saving this form.');return null;}
      const workspaceId=state.org.id,draft={...state},before={},events=[],messages=[];
      for(const [prop,key] of Object.entries(procurementKeys)){before[key]=JSON.parse(JSON.stringify(state[prop]||[]));draft[prop]=JSON.parse(JSON.stringify(before[key]));}
      form.dataset.masterBusy='1';form.inert=true;feedback(form,'Saving to this workspace…');
      try{
        await work(draft,{...ctx,_procurementDraft:true,audit:(action,metadata)=>events.push({action,metadata}),save:()=>{},render:()=>{},toast:message=>messages.push(message)});
        if(!events.length){ctx.toast(messages.at(-1)||'No record was saved.');return null;}
        if(!ctx.isCurrent())throw Object.assign(Error(),{code:'permission'});
        const changes={};
        for(const [prop,key] of Object.entries(procurementKeys)){
          for(const row of draft[prop])if(!before[key].some(old=>old.id===row.id)){row.organizationId=workspaceId;row.createdByUserId=state.session?.userId;}
          if(JSON.stringify(before[key])!==JSON.stringify(draft[prop]))changes[key]=draft[prop];
        }
        const last=events.at(-1);
        await window.DalasiProduction.commitProcurementData(workspaceId,changes,{action:last.action,metadata:{...last.metadata,events}},before);
        if(!ctx.isCurrent())return null;
        for(const prop of Object.keys(procurementKeys))state[prop]=draft[prop];
        for(const prop of ['expenseOpen','purchaseOpen','billOpen','purchaseBillId','paymentOpen','paymentBillId','paymentBeneficiaryId','purchasePrefillLines','paymentApprovalAction'])if(prop in draft)state[prop]=draft[prop];
        delete form.dataset.masterBusy;form.inert=false;
        base.toast(messages.at(-1)||'Saved to this workspace');base.render();return true;
      }finally{delete form.dataset.masterBusy;form.inert=false;}
    });
  }
  async function actionTransaction(state,base,work){
    const form=document.createElement('form');form.dataset.workspaceId=state.org?.id||'';
    const result=await transaction(form,state,{...base,toast:base.toast},work);
    if(!result){const message=form.querySelector('[data-master-feedback]')?.textContent;if(message)base.toast(message);}
    return result;
  }
  const ids=['ledger-account-form','beneficiary-form','manual-journal-form','purchase-form','expense-form','business-bill-form','purchase-bill-form','business-payment-form','payment-approval-form'];
  function capture(document,state){
    return ids.flatMap(id=>{
      const form=document.getElementById(id);if(!form||form.dataset.workspaceId!==state.org?.id||form.dataset.userId!==(state.session?.userId||''))return [];
      return [{id,workspaceId:state.org.id,html:form.innerHTML,controls:[...form.querySelectorAll('input,select,textarea')].map(input=>({value:input.value,checked:input.checked,files:input.type==='file'?input.files:null}))}];
    });
  }
  function restore(document,state,drafts){
    for(const draft of drafts||[]){
      const form=document.getElementById(draft.id);if(!form||draft.workspaceId!==state.org?.id)continue;
      form.innerHTML=draft.html;form.dataset.draftRestored='1';
      [...form.querySelectorAll('input,select,textarea')].forEach((input,index)=>{const saved=draft.controls[index];if(!saved)return;if(input.type==='file'){if(saved.files)input.files=saved.files;}else input.value=saved.value;if(input.type==='checkbox'||input.type==='radio')input.checked=saved.checked;});
    }
  }
  function saving(document,state){return ids.some(id=>{const form=document.getElementById(id);return form?.dataset.masterBusy&&form.dataset.workspaceId===state.org?.id&&form.dataset.userId===(state.session?.userId||'');});}
  window.DalasiMasterForms={context,create,transaction,actionTransaction,feedback,errorText,capture,restore,saving};
})();
