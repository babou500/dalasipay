(function(){
  'use strict';

  const CHART=[
    ['1000','Cash & Bank','Asset'],['1010','Undeposited Funds','Asset'],['1100','Accounts Receivable','Asset'],['1150','VAT Input Recoverable','Asset'],['1160','Supplier Refund Receivable','Asset'],['1200','Inventory','Asset'],['1300','Other Current Assets','Asset'],['1500','Property & Equipment, Cost','Asset'],['1510','Accumulated Depreciation','Asset'],['1590','Property & Equipment, Net','Asset'],
    ['2000','Accounts Payable','Liability'],['2050','Accrued Expenses','Liability'],['2060','Accrued Interest Payable','Liability'],['2070','Customer Refunds Payable','Liability'],['2100','Payroll Payable','Liability'],['2150','VAT Output Payable','Liability'],['2110','Payroll / Statutory Payable','Liability'],['2200','Loans & Borrowings','Liability'],['2250','Other Liabilities','Liability'],['2300','Inventory Receipt Clearing','Liability'],
    ['3000','Owner / Share Capital','Equity'],['3100','Opening Retained Earnings','Equity'],['3190','Opening Balance Equity','Equity'],['3990','Opening / Mapping Suspense','Equity'],
    ['4000','Sales Revenue','Revenue'],['4010','Sales Discounts','Revenue'],['4100','Other Business Income','Revenue'],['4110','Discounts Received','Revenue'],['4200','Gain on Asset Disposal','Revenue'],
    ['5000','Cost of Goods Sold','Expense'],['6000','Operating Expenses','Expense'],['6010','Office Supplies','Expense'],['6020','Rent & Utilities','Expense'],['6030','Professional Fees','Expense'],['6040','Travel & Logistics','Expense'],['6050','Government & Statutory Fees','Expense'],['6060','Repairs & Maintenance','Expense'],['6070','Marketing & Promotion','Expense'],['6080','Other Operating Expenses','Expense'],['6100','Payroll & Employer Costs','Expense'],['6200','Depreciation Expense','Expense'],['6210','Loss on Asset Disposal','Expense'],['6300','Finance Costs / Interest Expense','Expense']
  ];
  const ACCOUNT=Object.fromEntries(CHART.map(x=>[x[1],{code:x[0],name:x[1],type:x[2]}]));
  const round=n=>Math.round((Number(n)||0)*100)/100;
  const dateOnly=v=>String(v||'').slice(0,10);
  function acc(name){if(name&&typeof name==='object'&&name.name)return {code:String(name.code||'9999'),name:String(name.name),type:String(name.type||'Other')};return ACCOUNT[name]||{code:'9999',name,type:'Other'};}
  function postingAccount(state,name,fallback='Operating Expenses'){
    return window.DalasiAccounting?.accountByName?.(state,name)||ACCOUNT[name]||ACCOUNT[fallback]||{code:'9999',name:name||fallback,type:'Expense'};
  }
  function sourceMeta(journalId){
    const id=String(journalId||''),map=[['INV-','customer-invoice'],['COL-','customer-collection'],['CCN-','customer-credit-note'],['CDN-','customer-debit-note'],['REV-','revenue'],['BILL-','supplier-bill'],['PAY-','business-payment'],['SCN-','supplier-credit-note'],['SDN-','supplier-debit-note'],['SREF-','supplier-refund'],['CREF-','customer-refund'],['VATPAY-','vat-payment'],['EXP-','expense'],['FA-','fixed-asset'],['FADISP-','fixed-asset'],['FADEP-','fixed-asset'],['LOAN-','loan'],['LRP-','loan-repayment']];
    for(const [p,t] of map)if(id.startsWith(p))return {sourceType:t,sourceId:id.slice(p.length)};
    return {sourceType:'',sourceId:''};
  }
  function line(journalId,date,reference,source,account,debit=0,credit=0,memo=''){
    const a=acc(account),meta=sourceMeta(journalId);return {journalId,date:dateOnly(date),reference:String(reference||''),source:String(source||''),sourceType:meta.sourceType,sourceId:meta.sourceId,accountCode:a.code,account:a.name,accountType:a.type,debit:round(debit),credit:round(credit),memo:String(memo||'')};
  }
  function pushJournal(out,id,date,reference,source,entries){
    const valid=(entries||[]).filter(x=>(Number(x.debit)||0)||(Number(x.credit)||0));if(!valid.length)return;
    valid.forEach(x=>out.push(line(id,date,reference,source,x.account,x.debit,x.credit,x.memo)));
  }
  function cashAccountName(state,id){
    const a=window.DalasiCashBank?.accountById?.(state,id);return a?(a.name||'Cash & Bank'):'Undeposited Funds';
  }
  function invoiceStatus(state,inv){return window.DalasiSalesInvoices?.status?.(state,inv)||(inv.status||'Draft');}
  function journals(state){
    const out=[],today=new Date().toISOString().slice(0,10);

    // Opening / manually supplied financial-position balances
    const setup=Object.assign({cashBank:0,pettyCash:0,otherCurrentAssets:0,fixedAssetsNet:0,loansBorrowings:0,otherLiabilities:0,ownerCapital:0,openingRetainedEarnings:0},state.balanceSheetSetup||{});
    const hasCashAccounts=(state.cashAccounts||[]).length>0,hasFixedAssetRegister=(state.fixedAssets||[]).length>0,hasLoanRegister=(state.businessLoans||[]).length>0;
    let openDebit=0,openCredit=0;
    const opening=[];
    const addOpen=(account,debit=0,credit=0,memo='')=>{opening.push({account,debit,credit,memo});openDebit+=Number(debit)||0;openCredit+=Number(credit)||0;};
    if(!hasCashAccounts){addOpen('Cash & Bank',Math.max(0,Number(setup.cashBank)||0),0,'Manual opening bank balance');addOpen('Cash & Bank',Math.max(0,Number(setup.pettyCash)||0),0,'Manual opening petty cash balance');}
    addOpen('Other Current Assets',Math.max(0,Number(setup.otherCurrentAssets)||0),0,'Opening financial-position setup');
    if(!hasFixedAssetRegister)addOpen('Property & Equipment, Net',Math.max(0,Number(setup.fixedAssetsNet)||0),0,'Opening financial-position setup');
    if(!hasLoanRegister)addOpen('Loans & Borrowings',0,Math.max(0,Number(setup.loansBorrowings)||0),'Opening financial-position setup');
    addOpen('Other Liabilities',0,Math.max(0,Number(setup.otherLiabilities)||0),'Opening financial-position setup');
    addOpen('Owner / Share Capital',0,Math.max(0,Number(setup.ownerCapital)||0),'Opening financial-position setup');
    addOpen('Opening Retained Earnings',0,Math.max(0,Number(setup.openingRetainedEarnings)||0),'Opening financial-position setup');
    if(openDebit||openCredit){
      const diff=round(openDebit-openCredit);
      if(diff>0)addOpen('Opening / Mapping Suspense',0,diff,'Balances opening setup until source balances fully map');
      else if(diff<0)addOpen('Opening / Mapping Suspense',Math.abs(diff),0,'Balances opening setup until source balances fully map');
      pushJournal(out,'OPEN-SETUP','1900-01-01','Opening setup','Opening balances',opening);
    }

    // Cash account opening balances
    (state.cashAccounts||[]).forEach(a=>{
      const amount=round(a.openingBalance||0);if(!amount)return;
      pushJournal(out,'OPEN-'+a.id,a.openingDate||a.createdAt||today,a.reference||a.name,'Cash account opening',[
        {account:a.name||'Cash & Bank',debit:amount>0?amount:0,credit:amount<0?Math.abs(amount):0,memo:a.name},
        {account:'Opening Balance Equity',debit:amount<0?Math.abs(amount):0,credit:amount>0?amount:0,memo:'Opening balance contra'}
      ]);
    });

    // Issued invoices. Discounts are posted separately as contra-revenue.
    (state.customerInvoices||[]).forEach(inv=>{
      if(invoiceStatus(state,inv)==='Draft')return;
      const amt=round(inv.amount);if(!amt)return;
      const discountGross=round(inv.discountTotal||0);
      const subtotalGross=round(inv.subtotal||((Number(inv.amount)||0)+discountGross));
      const tax=window.DalasiTax?.meta?.(state,inv,'sale')||{taxNet:amt,vatAmount:0};
      const preDiscountTax=window.DalasiTax?.snapshot?.(state,subtotalGross,inv.taxCode||'OUT','sale',inv.taxPricingMode||'inclusive')||{taxNet:subtotalGross,vatAmount:0};
      const salesDiscount=round(Math.max(0,(Number(preDiscountTax.taxNet)||subtotalGross)-(Number(tax.taxNet)||amt)));
      pushJournal(out,'INV-'+inv.id,inv.issueDate||inv.createdAt,inv.invoiceNo||inv.id,'Customer invoice',[
        {account:'Accounts Receivable',debit:amt,memo:inv.customerName||''},
        {account:'Sales Discounts',debit:salesDiscount,memo:salesDiscount?'Invoice discount':''},
        {account:'Sales Revenue',credit:round(preDiscountTax.taxNet),memo:inv.description||'Customer invoice'},
        {account:'VAT Output Payable',credit:round(tax.vatAmount),memo:tax.vatAmount?'Output VAT on discounted invoice value':''}
      ]);
    });

    // Customer collections. Reversed receipts keep the original posting and add an opposite entry on the reversal date.
    (state.incomingPayments||[]).forEach(p=>{
      const amt=round(p.amount);if(!amt)return;
      pushJournal(out,'COL-'+p.id,p.receivedDate||p.createdAt,p.receiptNumber||p.reference||p.id,'Customer collection',[
        {account:cashAccountName(state,p.accountId),debit:amt,memo:p.customerName||''},
        {account:'Accounts Receivable',credit:amt,memo:'Customer collection'}
      ]);
      if(p.reversedAt){
        pushJournal(out,'COL-REV-'+p.id,p.reversedAt,p.receiptNumber||p.reference||p.id,'Customer collection reversal',[
          {account:'Accounts Receivable',debit:amt,memo:p.reversalReason||'Receipt reversal'},
          {account:cashAccountName(state,p.accountId),credit:amt,memo:p.customerName||''}
        ]);
      }
    });

    // Customer credit notes and cash refunds.
    (state.customerCreditNotes||[]).filter(x=>x.status!=='Void').forEach(c=>{
      const gross=round(c.amount),net=round(c.taxNet??gross),vat=round(c.vatAmount),ar=round(c.arReduction),refund=round(c.refundDue);if(!gross)return;
      pushJournal(out,'CCN-'+c.id,c.date||c.createdAt,c.creditNo||c.id,'Customer credit note',[
        {account:'Sales Revenue',debit:net,memo:c.reason||c.note||''},
        {account:'VAT Output Payable',debit:vat,memo:vat?'Output VAT reversed':''},
        {account:'Accounts Receivable',credit:ar,memo:c.invoiceNo||''},
        {account:'Customer Refunds Payable',credit:refund,memo:c.customerName||''}
      ]);
    });
    (state.customerRefunds||[]).forEach(r=>{
      const amt=round(r.amount);if(!amt)return;const c=(state.customerCreditNotes||[]).find(x=>x.id===r.creditNoteId);
      pushJournal(out,'CREF-'+r.id,r.date||r.createdAt,r.reference||r.id,'Customer refund',[
        {account:'Customer Refunds Payable',debit:amt,memo:c?.customerName||''},
        {account:cashAccountName(state,r.accountId),credit:amt,memo:c?.creditNo||''}
      ]);
    });

    // Customer debit notes.
    (state.customerDebitNotes||[]).filter(x=>x.status!=='Void').forEach(d=>{
      const gross=round(d.amount),net=round(d.taxNet??gross),vat=round(d.vatAmount);if(!gross)return;
      pushJournal(out,'CDN-'+d.id,d.date||d.createdAt,d.debitNo||d.id,'Customer debit note',[
        {account:'Accounts Receivable',debit:gross,memo:d.customerName||''},
        {account:'Sales Revenue',credit:net,memo:d.reason||d.note||''},
        {account:'VAT Output Payable',credit:vat,memo:vat?'Output VAT added':''}
      ]);
    });

    // Direct income
    (state.revenueEntries||[]).forEach(x=>{
      const amt=round(x.amount);if(!amt)return;
      const tax=window.DalasiTax?.meta?.(state,x,'sale')||{taxNet:amt,vatAmount:0};
      pushJournal(out,'REV-'+x.id,x.revenueDate||x.createdAt,x.revenueNo||x.reference||x.id,'Direct income',[
        {account:cashAccountName(state,x.accountId),debit:amt,memo:x.payer||''},
        {account:'Other Business Income',credit:round(tax.taxNet),memo:x.category||x.description||''},
        {account:'VAT Output Payable',credit:round(tax.vatAmount),memo:tax.vatAmount?'Output VAT included in direct income':''}
      ]);
    });

    // Inventory movements: opening, receipts, sales issues, write-offs/corrections
    (state.inventoryMovements||[]).forEach(mv=>{
      const qty=Number(mv.quantity)||0,unit=Number(mv.unitCost);
      let amount=Number(mv.costAmount);
      if(!Number.isFinite(amount)||amount<0){
        const item=(state.salesCatalog||[]).find(x=>x.id===mv.catalogId);
        const cost=Number.isFinite(unit)?unit:(Number(item?.costPrice)||0);amount=Math.abs(qty)*Math.max(0,cost);
      }
      amount=round(amount);if(!amount)return;
      if(mv.type==='Sales return'){
        pushJournal(out,'SRET-'+mv.id,mv.movementDate||mv.createdAt,mv.reference||mv.id,'Customer stock return',[{account:'Inventory',debit:amount,memo:mv.note||''},{account:'Cost of Goods Sold',credit:amount,memo:mv.note||''}]);
      }else if(mv.type==='Purchase return'){
        pushJournal(out,'PRET-'+mv.id,mv.movementDate||mv.createdAt,mv.reference||mv.id,'Supplier stock return',[{account:'Inventory Receipt Clearing',debit:amount,memo:mv.note||''},{account:'Inventory',credit:amount,memo:mv.note||''}]);
      }else if(mv.type==='Sales issue'){
        pushJournal(out,'COGS-'+mv.id,mv.revenueDate||mv.createdAt,mv.reference||mv.id,'Inventory sale issue',[
          {account:'Cost of Goods Sold',debit:amount,memo:mv.note||''},{account:'Inventory',credit:amount,memo:mv.note||''}
        ]);
      }else if(mv.type==='Purchase receipt'){
        pushJournal(out,'RCV-'+mv.id,mv.movementDate||mv.createdAt,mv.reference||mv.id,'Inventory purchase receipt',[
          {account:'Inventory',debit:amount,memo:mv.note||''},{account:'Inventory Receipt Clearing',credit:amount,memo:'Awaiting supplier bill / purchase matching'}
        ]);
      }else if(mv.type==='Opening balance'){
        pushJournal(out,'INVOPEN-'+mv.id,mv.movementDate||mv.createdAt,mv.reference||mv.id,'Inventory opening',[
          {account:'Inventory',debit:amount,memo:mv.note||''},{account:'Opening Balance Equity',credit:amount,memo:'Opening inventory contra'}
        ]);
      }else if(qty<0){
        pushJournal(out,'INVADJ-'+mv.id,mv.movementDate||mv.createdAt,mv.reference||mv.id,'Inventory adjustment',[
          {account:'Operating Expenses',debit:amount,memo:mv.type||'Inventory write-off'},{account:'Inventory',credit:amount,memo:mv.note||''}
        ]);
      }else if(qty>0){
        pushJournal(out,'INVADJ-'+mv.id,mv.createdAt,mv.reference||mv.id,'Inventory adjustment',[
          {account:'Inventory',debit:amount,memo:mv.note||''},{account:'Opening / Mapping Suspense',credit:amount,memo:mv.type||'Inventory increase'}
        ]);
      }
    });

    // Expenses. A reversed paid expense keeps its original posting and receives an opposite journal on the reversal date.
    (state.businessExpenses||[]).forEach(x=>{
      if(!['Approved','Paid','Reversed'].includes(x.status))return;
      const amt=round(x.amount);if(!amt)return;
      const tax=window.DalasiTax?.meta?.(state,x,'purchase')||{taxNet:amt,vatAmount:0,vatRecoverable:false},net=round(tax.vatRecoverable?tax.taxNet:amt),vat=round(tax.vatRecoverable?tax.vatAmount:0);
      if(x.status==='Paid'||x.status==='Reversed'){
        pushJournal(out,'EXP-'+x.id,x.expenseDate||x.paidAt||x.createdAt,x.expenseNo||x.reference||x.id,'Paid expense',[
          {account:'Operating Expenses',debit:net,memo:x.category||x.description||''},
          {account:'VAT Input Recoverable',debit:vat,memo:vat?'Recoverable input VAT':''},
          {account:cashAccountName(state,x.accountId),credit:amt,memo:x.merchant||''}
        ]);
        if(x.reversedAt){
          pushJournal(out,'EXP-REV-'+x.id,x.reversedAt,x.expenseNo||x.reference||x.id,'Expense reversal',[
            {account:cashAccountName(state,x.accountId),debit:amt,memo:x.merchant||''},
            {account:'VAT Input Recoverable',credit:vat,memo:vat?'Reverse recoverable input VAT':''},
            {account:'Operating Expenses',credit:net,memo:x.reversalReason||x.category||'Expense reversal'}
          ]);
        }
      }else{
        pushJournal(out,'EXP-'+x.id,x.expenseDate||x.createdAt,x.expenseNo||x.reference||x.id,'Accrued expense',[
          {account:'Operating Expenses',debit:net,memo:x.category||x.description||''},
          {account:'VAT Input Recoverable',debit:vat,memo:vat?'Recoverable input VAT':''},
          {account:'Accrued Expenses',credit:amt,memo:x.merchant||''}
        ]);
      }
    });

    // Supplier bills. Product PO lines clear inventory receipt clearing; the remainder posts to the selected expense/asset account.
    (state.businessBills||[]).forEach(b=>{
      if(!['Approved','Part paid','Paid'].includes(b.status||'Draft'))return;
      const amt=round(b.amount);if(!amt)return;
      const discountGross=round(b.discountTotal||0),subtotalGross=round(b.subtotal||((Number(b.amount)||0)+discountGross));
      const tax=window.DalasiTax?.meta?.(state,b,'purchase')||{taxNet:amt,vatAmount:0,vatRecoverable:false};
      const preDiscountTax=window.DalasiTax?.snapshot?.(state,subtotalGross,b.taxCode||'OUT','purchase',b.taxPricingMode||'inclusive')||{taxNet:subtotalGross,vatAmount:0,vatRecoverable:false};
      const net=round(tax.vatRecoverable?tax.taxNet:amt),vat=round(tax.vatRecoverable?tax.vatAmount:0);
      const grossExpenseBase=round(preDiscountTax.vatRecoverable?preDiscountTax.taxNet:subtotalGross);
      const discountReceived=round(Math.max(0,grossExpenseBase-net));
      const po=b.purchaseOrderId?(state.purchaseOrders||[]).find(x=>x.id===b.purchaseOrderId):null;
      let productBase=0;
      if(po){
        (po.lineItems||[]).forEach(l=>{
          const item=l.catalogId?window.DalasiCatalog?.itemById?.(state,l.catalogId):null;if(item?.type!=='Product')return;
          const raw=Math.max(0,(Number(l.quantity)||0)*(Number(l.unitPrice)||0));
          const pt=window.DalasiTax?.snapshot?.(state,raw,b.taxCode||po.taxCode||'OUT','purchase',b.taxPricingMode||po.taxPricingMode||'inclusive')||{taxNet:raw,vatRecoverable:false};
          productBase+=pt.vatRecoverable?Number(pt.taxNet)||0:raw;
        });
      }
      productBase=round(Math.min(grossExpenseBase,Math.max(0,productBase)));
      const otherBase=round(Math.max(0,grossExpenseBase-productBase));
      const mapped=postingAccount(state,b.postingAccount||po?.postingAccount||'Operating Expenses','Operating Expenses');
      pushJournal(out,'BILL-'+b.id,b.invoiceDate||b.createdAt,b.invoiceNo||b.id,'Supplier bill',[
        {account:'Inventory Receipt Clearing',debit:productBase,memo:productBase?'Clear received product value from '+(po?.poNumber||'purchase order'):''},
        {account:mapped,debit:otherBase,memo:b.description||b.category||'Supplier bill'},
        {account:'VAT Input Recoverable',debit:vat,memo:vat?'Recoverable input VAT on discounted supplier bill':''},
        {account:'Discounts Received',credit:discountReceived,memo:discountReceived?'Supplier discount received':''},
        {account:'Accounts Payable',credit:amt,memo:b.supplier||''}
      ]);
    });

    // Supplier credit notes reverse the original bill mapping. Product returns clear the receipt-clearing account.
    (state.supplierCreditNotes||[]).filter(x=>x.status!=='Void').forEach(c=>{
      const gross=round(c.amount),net=round(c.taxNet??gross),vat=round(c.vatAmount),ap=round(c.apReduction),refund=round(c.refundReceivable);if(!gross)return;
      const bill=(state.businessBills||[]).find(b=>b.id===c.billId),mapped=postingAccount(state,bill?.postingAccount||'Operating Expenses','Operating Expenses');
      const returnedBase=round(Math.min(net,(c.returnItems||[]).reduce((a,x)=>a+(Number(x.costAmount)||0),0))),mappedBase=round(Math.max(0,net-returnedBase));
      pushJournal(out,'SCN-'+c.id,c.date||c.createdAt,c.creditNo||c.supplierReference||c.id,'Supplier credit note',[
        {account:'Accounts Payable',debit:ap,memo:c.billNo||''},
        {account:'Supplier Refund Receivable',debit:refund,memo:c.supplier||''},
        {account:'Inventory Receipt Clearing',credit:returnedBase,memo:returnedBase?'Returned inventory against '+(c.billNo||'supplier bill'):''},
        {account:mapped,credit:mappedBase,memo:c.note||'Supplier bill credit'},
        {account:'VAT Input Recoverable',credit:vat,memo:vat?'Recoverable input VAT reversed':''}
      ]);
    });
    (state.supplierRefunds||[]).forEach(r=>{
      const amt=round(r.amount);if(!amt)return;const c=(state.supplierCreditNotes||[]).find(x=>x.id===r.creditNoteId);
      pushJournal(out,'SREF-'+r.id,r.date||r.createdAt,r.reference||r.id,'Supplier refund received',[
        {account:cashAccountName(state,r.accountId),debit:amt,memo:c?.supplier||''},
        {account:'Supplier Refund Receivable',credit:amt,memo:c?.creditNo||''}
      ]);
    });

    // Supplier debit notes follow the original bill's mapped expense/asset account.
    (state.supplierDebitNotes||[]).filter(x=>x.status!=='Void').forEach(d=>{
      const gross=round(d.amount),net=round(d.taxNet??gross),vat=round(d.vatRecoverable?d.vatAmount:0);if(!gross)return;
      const bill=(state.businessBills||[]).find(b=>b.id===d.billId),mapped=postingAccount(state,bill?.postingAccount||'Operating Expenses','Operating Expenses');
      pushJournal(out,'SDN-'+d.id,d.date||d.createdAt,d.debitNo||d.supplierReference||d.id,'Supplier debit note',[
        {account:mapped,debit:round(d.vatRecoverable?net:gross),memo:d.note||'Supplier additional charge'},
        {account:'VAT Input Recoverable',debit:vat,memo:vat?'Recoverable input VAT added':''},
        {account:'Accounts Payable',credit:gross,memo:d.supplier||''}
      ]);
    });

    // Paid business payments. Reversed payments retain the original entry and add an opposite entry on the reversal date.
    (state.businessPayments||[]).forEach(p=>{
      if(!['Paid','Reversed'].includes(p.status))return;
      const amt=round(p.amount);if(!amt)return;
      const clearing=p.billId?'Accounts Payable':'Opening / Mapping Suspense';
      pushJournal(out,'PAY-'+p.id,p.paidAt||p.dueDate||p.createdAt,p.receiptNumber||p.voucherNumber||p.reference||p.id,'Business payment',[
        {account:clearing,debit:amt,memo:p.payee||''},
        {account:cashAccountName(state,p.accountId),credit:amt,memo:p.description||''}
      ]);
      if(p.reversedAt){
        pushJournal(out,'PAY-REV-'+p.id,p.reversedAt,p.receiptNumber||p.voucherNumber||p.reference||p.id,'Business payment reversal',[
          {account:cashAccountName(state,p.accountId),debit:amt,memo:p.payee||''},
          {account:clearing,credit:amt,memo:p.reversalReason||p.description||'Payment reversal'}
        ]);
      }
    });

    // VAT payments to GRA.
    (state.vatPayments||[]).forEach(p=>{
      const amt=round(p.amount);if(!amt)return;
      pushJournal(out,'VATPAY-'+p.id,p.date||p.createdAt,p.reference||p.id,'VAT payment',[
        {account:'VAT Output Payable',debit:amt,memo:'VAT settlement for '+(p.period||'')},
        {account:cashAccountName(state,p.accountId),credit:amt,memo:'Gambia Revenue Authority'}
      ]);
    });

    // Business loans: drawdowns/opening balances, interest accruals and repayments.
    (state.businessLoans||[]).forEach(l=>{
      const principal=round(l.principal);if(!principal)return;
      pushJournal(out,'LOAN-'+l.id,l.startDate||l.createdAt,l.reference||l.id,'Loan recognition',[
        {account:l.source==='Cash drawdown'?cashAccountName(state,l.accountId):'Opening Balance Equity',debit:principal,memo:l.lender||''},
        {account:'Loans & Borrowings',credit:principal,memo:l.lender||''}
      ]);
    });
    (state.loanInterestAccruals||[]).filter(x=>x.status==='Posted').forEach(x=>{
      const amount=round(x.amount);if(!amount)return;
      pushJournal(out,'LINT-'+x.id,x.date||((x.period||'')+'-28'),x.period||x.id,'Loan interest accrual',[
        {account:'Finance Costs / Interest Expense',debit:amount,memo:x.lender||''},
        {account:'Accrued Interest Payable',credit:amount,memo:x.lender||''}
      ]);
    });
    (state.loanRepayments||[]).forEach(x=>{
      const principal=round(x.principal),interest=round(x.interest),amount=round(x.amount);if(!amount)return;
      pushJournal(out,'LRP-'+x.id,x.date||x.createdAt,x.reference||x.id,'Loan repayment',[
        {account:'Loans & Borrowings',debit:principal,memo:x.lender||''},
        {account:'Accrued Interest Payable',debit:interest,memo:x.lender||''},
        {account:cashAccountName(state,x.accountId),credit:amount,memo:x.lender||''}
      ]);
    });

    // Fixed assets: acquisition, depreciation and disposal.
    (state.fixedAssets||[]).forEach(a=>{
      const cost=round(a.cost),openingAccum=round(a.openingAccumDep),source=a.source==='Cash purchase'?cashAccountName(state,a.accountId):'Opening Balance Equity';
      if(cost){
        pushJournal(out,'FA-'+a.id,a.acquisitionDate||a.createdAt,a.reference||a.assetNo||a.id,'Fixed asset acquisition',[
          {account:'Property & Equipment, Cost',debit:cost,memo:a.name||a.category||''},
          {account:source,credit:cost,memo:a.source||'Opening balance'}
        ]);
      }
      if(openingAccum){
        pushJournal(out,'FAOPENDEP-'+a.id,a.acquisitionDate||a.createdAt,a.reference||a.assetNo||a.id,'Opening accumulated depreciation',[
          {account:'Opening Balance Equity',debit:openingAccum,memo:a.name||''},
          {account:'Accumulated Depreciation',credit:openingAccum,memo:a.name||''}
        ]);
      }
      if(a.status==='Disposed'&&a.disposalDate){
        const accum=round(a.disposalAccumDep),proceeds=round(a.disposalProceeds),gainLoss=round(a.disposalGainLoss);
        pushJournal(out,'FADISP-'+a.id,a.disposalDate,a.disposalReference||a.assetNo||a.id,'Fixed asset disposal',[
          {account:'Accumulated Depreciation',debit:accum,memo:a.name||''},
          {account:cashAccountName(state,a.disposalAccountId),debit:proceeds,memo:'Disposal proceeds'},
          {account:'Loss on Asset Disposal',debit:gainLoss<0?Math.abs(gainLoss):0,memo:a.name||''},
          {account:'Property & Equipment, Cost',credit:cost,memo:a.name||''},
          {account:'Gain on Asset Disposal',credit:gainLoss>0?gainLoss:0,memo:a.name||''}
        ]);
      }
    });
    (state.fixedAssetDepreciation||[]).filter(x=>x.status==='Posted').forEach(x=>{
      const amount=round(x.amount);if(!amount)return;
      pushJournal(out,'FADEP-'+x.id,x.date||((x.period||'')+'-28'),x.assetNo||x.id,'Fixed asset depreciation',[
        {account:'Depreciation Expense',debit:amount,memo:x.assetName||x.assetNo||''},
        {account:'Accumulated Depreciation',credit:amount,memo:x.assetName||x.assetNo||''}
      ]);
    });

    // Payroll: expense when approved/paid/closed, liabilities and settlement.
    (state.runs||[]).filter(r=>['Approved','Paid','Closed'].includes(r.status)&&Array.isArray(r.rows)).forEach(run=>{
      const rows=run.rows||[],gross=round(rows.reduce((a,r)=>a+(Number(r.gross)||0),0)),net=round(rows.reduce((a,r)=>a+(Number(r.net)||0),0)),
        employeeContribution=round(rows.reduce((a,r)=>a+(Number(r.employeeContribution)||0),0)),employerContribution=round(rows.reduce((a,r)=>a+(Number(r.employerContribution)||0),0)),
        paye=round(rows.reduce((a,r)=>a+(Number(r.paye)||0),0)),iicf=round(rows.reduce((a,r)=>a+(Number(r.iicf)||0),0)),benefits=round(rows.reduce((a,r)=>a+(Number(r.employerBenefits)||0),0)),
        other=round(rows.reduce((a,r)=>a+(Number(r.otherDeductions)||0),0)),employerCost=round(Number(run.totals?.employerCost)||rows.reduce((a,r)=>a+(Number(r.employerCost)||0),0)),
        statutory=round(paye+employeeContribution+employerContribution+iicf+benefits+other);
      const date=(run.approvedAt||run.updatedAt||today);
      if(employerCost){
        pushJournal(out,'PAYROLL-'+run.id,date,run.period,'Payroll recognition',[
          {account:'Payroll & Employer Costs',debit:employerCost,memo:run.period},
          {account:'Payroll Payable',credit:net,memo:'Net payroll'},
          {account:'Payroll / Statutory Payable',credit:statutory,memo:'PAYE, social, IICF and deductions'},
          {account:'Opening / Mapping Suspense',credit:Math.max(0,round(employerCost-net-statutory)),debit:Math.max(0,round(net+statutory-employerCost)),memo:'Payroll calculation bridge'}
        ]);
      }
      if(['Paid','Closed'].includes(run.status)&&net){
        const accountId=run.cashAccountId||run.paymentAccountId||'';
        pushJournal(out,'PAYROLLPAY-'+run.id,run.paidAt||run.updatedAt||today,run.period,'Payroll payment',[
          {account:'Payroll Payable',debit:net,memo:run.period},
          {account:cashAccountName(state,accountId),credit:net,memo:'Net payroll paid'}
        ]);
      }
      if(run.statutoryPaidAt&&statutory){
        pushJournal(out,'STATPAY-'+run.id,run.statutoryPaidAt,run.period,'Payroll statutory remittance',[
          {account:'Payroll / Statutory Payable',debit:statutory,memo:run.period},
          {account:cashAccountName(state,run.statutoryCashAccountId||''),credit:statutory,memo:'Statutory remittance'}
        ]);
      }
    });

    // Posted manual journals and reversals
    (state.manualJournals||[]).filter(j=>j.status==='Posted').forEach(j=>{
      (j.lines||[]).forEach(x=>{
        if(!(Number(x.debit)||0)&&!(Number(x.credit)||0))return;
        out.push({journalId:j.journalNo||j.id,date:dateOnly(j.date||j.postedAt||today),reference:String(j.reference||j.journalNo||j.id),source:j.reversalOf?'Journal reversal':'Manual journal',sourceType:'manual-journal',sourceId:j.id,accountCode:String(x.accountCode||'9999'),account:String(x.account||'Unmapped account'),accountType:String(x.accountType||'Other'),debit:round(x.debit),credit:round(x.credit),memo:String(x.memo||j.memo||'')});
      });
    });

    // Cash transfers do not affect total cash but preserve account-level audit in cashbook; general ledger uses one pooled cash account, so omitted.
    return out.sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.journalId).localeCompare(String(b.journalId))||a.accountCode.localeCompare(b.accountCode));
  }
  function trialBalance(state){
    const rows=journals(state),map=new Map();
    CHART.forEach(([code,name,type])=>map.set(name,{code,name,type,debit:0,credit:0}));
    (window.DalasiAccounting?.cashLedgerAccounts?.(state)||[]).forEach(a=>{if(!map.has(a.name))map.set(a.name,{code:String(a.code||'9999'),name:a.name,type:a.type||'Asset',debit:0,credit:0});});
    (state.customAccounts||[]).forEach(a=>{if(!map.has(a.name))map.set(a.name,{code:String(a.code||'9999'),name:a.name,type:a.type||'Other',debit:0,credit:0});});
    rows.forEach(x=>{if(!map.has(x.account))map.set(x.account,{code:x.accountCode,name:x.account,type:x.accountType,debit:0,credit:0});const a=map.get(x.account);a.debit+=x.debit;a.credit+=x.credit;});
    const accounts=[...map.values()].map(x=>({...x,debit:round(x.debit),credit:round(x.credit),balance:round(x.debit-x.credit)})).filter(x=>x.debit||x.credit).sort((a,b)=>a.code.localeCompare(b.code));
    const debit=round(accounts.reduce((a,x)=>a+x.debit,0)),credit=round(accounts.reduce((a,x)=>a+x.credit,0));
    return {accounts,debit,credit,difference:round(debit-credit),balanced:Math.abs(debit-credit)<0.01,journalLines:rows.length};
  }
  function ledgerRows(state,accountName=''){
    const rows=journals(state).filter(x=>!accountName||x.account===accountName);let running=0;
    return rows.map(x=>{if(accountName)running=round(running+x.debit-x.credit);return {...x,running:accountName?running:null}});
  }
  function panel(state,h){
    const {money2,icon,esc}=h,t=trialBalance(state),selected=state.ledgerAccount||'',entries=ledgerRows(state,selected);
    const options=['<option value="">All accounts</option>'].concat(t.accounts.map(a=>'<option value="'+esc(a.name)+'" '+(a.name===selected?'selected':'')+'>'+esc(a.code+' · '+a.name)+'</option>')).join('');
    const tbRows=t.accounts.length?t.accounts.map(a=>'<tr><td><b>'+esc(a.code)+'</b></td><td>'+esc(a.name)+'</td><td>'+esc(a.type)+'</td><td>'+money2(a.debit)+'</td><td>'+money2(a.credit)+'</td><td><b>'+money2(Math.abs(a.balance))+' '+(a.balance>=0?'Dr':'Cr')+'</b></td></tr>').join(''):'<tr><td colspan="6"><div class="empty-inline">No ledger activity yet.</div></td></tr>';
    const glRows=entries.length?entries.slice().reverse().slice(0,250).map(x=>'<tr><td>'+esc(x.date||'')+'</td><td>'+esc(x.reference||x.journalId)+'</td><td>'+esc(x.source)+'</td><td>'+esc(x.accountCode+' · '+x.account)+'</td><td>'+esc(x.memo||'—')+'</td><td>'+money2(x.debit)+'</td><td>'+money2(x.credit)+'</td><td>'+(selected?money2(Math.abs(x.running))+' '+(x.running>=0?'Dr':'Cr'):'—')+'</td><td>'+(x.sourceId?'<button class="secondary tiny" data-action="source-open:'+esc(x.sourceType)+':'+esc(x.sourceId)+'">View source</button>':'—')+'</td></tr>').join(''):'<tr><td colspan="9"><div class="empty-inline">No journal lines for this selection.</div></td></tr>';
    const suspense=t.accounts.find(a=>a.name==='Opening / Mapping Suspense');
    return '<section class="surface ledger-card">'+
      '<div class="table-tools"><div><h3>Trial Balance</h3><p>System-generated double-entry summary from DalasiPay transactions and opening financial-position balances.</p></div><div class="inline-buttons"><button class="secondary" data-action="business-report-export:general-ledger">'+icon('download',14)+' Ledger CSV</button><button class="secondary" data-action="business-report-export:trial-balance">'+icon('download',14)+' Trial Balance CSV</button></div></div>'+
      '<div class="ledger-kpis"><div><span>Total debits</span><b>'+money2(t.debit)+'</b><small>'+t.journalLines+' journal lines</small></div><div><span>Total credits</span><b>'+money2(t.credit)+'</b><small>double-entry total</small></div><div class="'+(!t.balanced?'ledger-warning':'')+'"><span>Difference</span><b>'+money2(Math.abs(t.difference))+'</b><small>'+(t.balanced?'trial balance agrees':'journal imbalance')+'</small></div><div class="'+(suspense&&Math.abs(suspense.balance)>.004?'ledger-warning':'')+'"><span>Mapping suspense</span><b>'+money2(Math.abs(suspense?.balance||0))+'</b><small>'+(suspense&&Math.abs(suspense.balance)>.004?'needs account mapping':'clear')+'</small></div></div>'+
      '<div class="table-scroll"><table><thead><tr><th>CODE</th><th>ACCOUNT</th><th>TYPE</th><th>DEBIT</th><th>CREDIT</th><th>BALANCE</th></tr></thead><tbody>'+tbRows+'</tbody></table></div>'+
      (suspense&&Math.abs(suspense.balance)>.004?'<div class="ledger-note ledger-warning-note"><b>Mapping suspense is not zero.</b> This is intentional where DalasiPay knows the amount but not the final accounting account, such as unmatched supplier bills, uncategorized business payments or incomplete opening balances. It should be reviewed rather than hidden.</div>':'<div class="ledger-note"><b>Trial Balance balanced.</b> No debit/credit difference exists in the generated ledger.</div>')+
    '</section>'+
    '<section class="surface ledger-card"><div class="table-tools"><div><h3>General Ledger</h3><p>Drill into the journal by account. Latest 250 lines are shown.</p></div><select id="ledger-account-select">'+options+'</select></div><div class="table-scroll"><table><thead><tr><th>DATE</th><th>REFERENCE</th><th>SOURCE</th><th>ACCOUNT</th><th>MEMO</th><th>DEBIT</th><th>CREDIT</th><th>RUNNING BALANCE</th><th>SOURCE</th></tr></thead><tbody>'+glRows+'</tbody></table></div></section>';
  }
  function exportTrialBalance(state,ctx){
    const t=trialBalance(state),rows=[['Code','Account','Type','Debit','Credit','Balance','Balance Side'],...t.accounts.map(a=>[a.code,a.name,a.type,a.debit,a.credit,Math.abs(a.balance),a.balance>=0?'Dr':'Cr']),['','TOTAL','',t.debit,t.credit,Math.abs(t.difference),t.difference>=0?'Dr':'Cr']];
    const csv=rows.map(r=>r.map(v=>{const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}).join(',')).join('\n');ctx.downloadText('dalasipay-trial-balance-'+new Date().toISOString().slice(0,10)+'.csv',csv);ctx.toast('Trial Balance downloaded');
  }
  function exportLedger(state,ctx){
    const rows=ledgerRows(state),data=[['Date','Journal ID','Reference','Source','Account Code','Account','Account Type','Memo','Debit','Credit'],...rows.map(x=>[x.date,x.journalId,x.reference,x.source,x.accountCode,x.account,x.accountType,x.memo,x.debit,x.credit])];
    const csv=data.map(r=>r.map(v=>{const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}).join(',')).join('\n');ctx.downloadText('dalasipay-general-ledger-'+new Date().toISOString().slice(0,10)+'.csv',csv);ctx.toast('General Ledger downloaded');
  }
  window.DalasiGeneralLedger={CHART,journals,trialBalance,ledgerRows,panel,sourceMeta,exportTrialBalance,exportLedger};
})();