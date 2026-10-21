const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function practiceForm(task){
 let content={};try{content=JSON.parse(task.content||'{}');}catch{}
 if(task.taskType==='SEQUENCE')return `<p data-user-content>Выберите элементы по порядку. Каждый элемент используется один раз.</p><div class="show-matching" data-user-content>${(content.items||[]).map((_,i)=>`<label><span>Шаг ${i+1}</span><select name="sequence-${i}" required><option value="">Выберите элемент</option>${content.items.map(item=>`<option value="${esc(item)}">${esc(item)}</option>`).join('')}</select></label>`).join('')}</div>`;
 if(task.taskType==='MATCHING')return `<div class="show-matching" data-user-content>${(content.left||[]).map((item,i)=>`<label><span>${esc(item)}</span><select name="match-${i}" required><option value="">Выберите пару</option>${content.right.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select></label>`).join('')}</div>`;
 if(['NUMERIC','PROBLEM'].includes(task.taskType))return `<label class="show-numeric-label" data-user-content>Числовой ответ ${esc(content.unit||'')}<input name="answer" inputmode="decimal" required maxlength="80" placeholder="Введите число"></label>`;
 return null;
}
export function practiceAnswer(task,form){const values=new FormData(form);let content={};try{content=JSON.parse(task.content||'{}');}catch{}if(task.taskType==='SEQUENCE')return JSON.stringify(content.items.map((_,i)=>values.get('sequence-'+i)));if(task.taskType==='MATCHING')return JSON.stringify(Object.fromEntries(content.left.map((item,i)=>[item,values.get('match-'+i)])));return values.get('answer');}
