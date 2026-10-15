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
  const ids=['ledger-account-form','beneficiary-form','manual-journal-form','purchase-form','expense-form'];
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
  window.DalasiMasterForms={context,create,feedback,errorText,capture,restore,saving};
})();
