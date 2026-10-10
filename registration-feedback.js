(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DalasiAuthFeedback=api;})(typeof window!=='undefined'?window:globalThis,()=>{
  'use strict';
  // Identical guidance for new, existing, unconfirmed and email-provider outcomes.
  // A signup user object (including identities) does not prove account creation.
  const notices={
    signup:'Check your inbox for a confirmation link if one is needed. No email? Check spam, choose Resend confirmation, or try again later. You can also Sign in or choose Forgot password.',
    forgot:'If password recovery is available for this address, check your inbox for a reset link. No email? Check spam or try again later. You can return to Sign in.',
    confirmation:'If confirmation is still needed for this address, check your inbox for a confirmation link. No email? Check spam or try again later. Otherwise, Sign in or choose Forgot password.'
  };
  function feedback(flow,error){
    const code=String(error?.code||'');
    if(['signup','forgot','confirmation'].includes(flow)){
      // Only input validation is actionable without disclosing account state.
      if(['email_address_invalid','validation_failed'].includes(code))return {notice:'',error:'Check the email address and required fields, then try again.'};
      if(flow==='signup'&&code==='weak_password')return {notice:'',error:'Choose a stronger password with at least 8 characters.'};
      // Never claim creation or delivery, including SMTP/rate-limit failures.
      return {notice:notices[flow],error:''};
    }
    if(flow==='signin')return {notice:'',error:'Unable to sign in. Check your email and password, confirm your email if needed, or choose Forgot password.'};
    return {notice:'',error:'Unable to complete authentication. Please try again.'};
  }
  return Object.freeze({feedback,notices:Object.freeze(notices)});
});
