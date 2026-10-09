const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const title=value=>String(value??'—').replace(/[_-]+/g,' ').replace(/\b\w/g,letter=>letter.toUpperCase());
const date=value=>{
 const parsed=Date.parse(String(value??''));
 return Number.isFinite(parsed)?new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(parsed)):'—';
};
export function renderSubscriptions({subscriptions,nextOffset}){
 const rows=Array.isArray(subscriptions)?subscriptions:[];
 const previews=rows.filter(r=>r.professional_preview).length;
 const statuses=new Set(rows.map(r=>String(r.status??''))).size;
 const pagination=nextOffset===null?'':'<a class="next" href="/?offset='+Number(nextOffset)+'">Next page →</a>';
 const data=rows.map(r=>`<tr><td><span class="workspace" title="${escape(r.organization_id)}">${escape(r.organization_id)}</span></td><td>${escape(title(r.plan_id))}</td><td><span class="status">${escape(title(r.status))}</span></td><td>${r.professional_preview?'<span class="preview">Unlimited access</span>':'—'}</td><td class="date">${escape(date(r.updated_at))}</td></tr>`).join('');
 return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Subscriptions | DalasiPay Administrator</title>
<style>
:root{color-scheme:light;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#172a40;background:#f4f7fb}
*{box-sizing:border-box}body{margin:0}a{color:#145d91}main{max-width:1380px;margin:0 auto;padding:32px 36px 56px}
header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #dfe7ee;padding-bottom:22px;gap:20px}
.brand{display:flex;align-items:center;gap:12px;font-size:20px;font-weight:800;letter-spacing:-.5px}.mark{width:38px;height:38px;border-radius:11px;background:#103f65;color:#fff;display:grid;place-items:center;font-weight:800}
.flag{font-size:12px;font-weight:700;border:1px solid #bfd7e2;border-radius:999px;padding:7px 12px;color:#26546a;background:#e9f4f7}
.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:12px;font-weight:800;color:#56788e;margin:34px 0 8px}
h1{font-size:clamp(27px,3vw,39px);letter-spacing:-1.2px;line-height:1.2;margin:0 0 10px}p{line-height:1.6}.intro{color:#607589;margin:0 0 24px}
.notice{background:#edf6f6;border:1px solid #cce5e4;color:#245c61;border-radius:12px;padding:14px 18px;margin-bottom:24px;font-size:14px}
.summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-bottom:28px}
.metric{background:#fff;border:1px solid #e3eaf1;border-radius:14px;padding:21px 23px;box-shadow:0 2px 10px #1c3b5607}.metric small{display:block;color:#62798c;font-size:13px;font-weight:600}.metric strong{display:block;font-size:32px;letter-spacing:-1px;margin-top:8px}.metric span{display:block;font-size:12px;color:#7890a1;margin-top:2px}
.panel{background:white;border:1px solid #e0e7ee;border-radius:16px;overflow:hidden;box-shadow:0 3px 16px #1a3c5708}
.panelhead{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:21px 24px;border-bottom:1px solid #e9eef3}.panelhead h2{margin:0;font-size:18px;letter-spacing:-.3px}.panelhead p{margin:4px 0 0;color:#75899a;font-size:13px}
table{border-collapse:collapse;min-width:800px;width:100%}section{overflow-x:auto}th,td{text-align:left;padding:17px 20px;border-bottom:1px solid #edf1f5;font-size:13px}th{color:#667c8e;text-transform:uppercase;letter-spacing:.06em;font-size:11px;background:#f9fbfd}tbody tr:hover{background:#fafcfe}tbody tr:last-child td{border-bottom:0}
.workspace{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;color:#315772;font-size:12px;word-break:break-word}
.status{display:inline-block;background:#e9f2fa;color:#225985;border-radius:999px;padding:5px 10px;font-size:12px;font-weight:700}
.preview{color:#127263;font-weight:700}.date{color:#627789;white-space:nowrap}
.panelfoot{padding:16px 24px;background:#fcfdff;border-top:1px solid #e9eef3;display:flex;align-items:center;justify-content:space-between;gap:12px;color:#74899a;font-size:12px}.next{text-decoration:none;font-weight:700}
footer{padding-top:26px;color:#8294a4;font-size:12px}
@media(max-width:760px){main{padding:18px 15px 35px}header{padding-bottom:17px}.brand{font-size:17px}.flag{font-size:10px}.summary{grid-template-columns:1fr;gap:10px}.metric{padding:16px}.metric strong{font-size:25px}.panelhead{padding:17px}.eyebrow{margin-top:24px}}
</style></head><body><main>
<header><div class="brand"><span class="mark">D</span><span>DalasiPay <span style="font-weight:500;color:#658096">/ Administration</span></span></div><span class="flag">Secure · Read-only</span></header>
<p class="eyebrow">Platform oversight</p><h1>Subscription overview</h1>
<p class="intro">Review workspace subscriptions and preview entitlements without changing customer accounts.</p>
<div class="notice"><strong>Professional Preview protection is active.</strong> Unlimited preview access remains unchanged. Billing and subscription restrictions are disabled.</div>
<div class="summary"><div class="metric"><small>Subscriptions on this page</small><strong>${rows.length}</strong><span>${nextOffset===null?'End of subscription list':'More subscriptions on the next page'}</span></div><div class="metric"><small>Unlimited previews on this page</small><strong>${previews}</strong><span>Existing benefits preserved</span></div><div class="metric"><small>Subscription statuses on this page</small><strong>${statuses}</strong><span>Read-only overview</span></div></div>
<div class="panel"><div class="panelhead"><div><h2>Workspace subscriptions</h2><p>Verified subscription records from DalasiPay</p></div><span class="flag">View only</span></div>
<section><table><thead><tr><th scope="col">Workspace ID</th><th scope="col">Plan</th><th scope="col">Status</th><th scope="col">Entitlement</th><th scope="col">Updated (UTC)</th></tr></thead><tbody>${data}</tbody></table></section>
${rows.length?'':'<p style="padding:20px 24px">No subscriptions found.</p>'}
<div class="panelfoot"><span>Showing ${rows.length} records on this page</span>${pagination}</div></div>
<footer>DalasiPay Platform Administration · Powered by BE Business Solutions · Secure read-only access</footer>
</main></body></html>`;
}
