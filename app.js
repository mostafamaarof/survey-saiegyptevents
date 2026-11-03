/* SAI Egypt Survey Platform — survey app.
 * Shared by survey.html and 404.html (GitHub Pages serves 404.html for the
 * deep links /i/TOKEN, /s/SLUG and /c/CODE, so the router below decides what to show).
 * The API base URL comes from config.js (window.SURVEY_API). */
(function(){
  "use strict";
  var API = String(window.SURVEY_API || '').replace(/\/+$/, '');

  function startSurvey(CTX){
    "use strict";
    var SURVEY = CTX.survey || {};
    var T = {
      en:{ start:"Start Questionnaire", next:"Next", back:"Back", submit:"Submit Response",
           saveLater:"Save & continue later", saved:"Progress saved", section:"Section",
           of:"of", welcome:"Invitation", required:"This question is required",
           reqChoose:"Please select an option", reqEmail:"Please enter a valid email",
           other:"Other (please specify)", yes:"Yes", no:"No", est:"Estimated time",
           deadline:"Response deadline", print:"Print / save my answers", edit:"Edit my response",
           reviewSubmitting:"Submitting…", resumed:"Welcome back — your previous answers were restored.",
           rankHint:"Use the arrows to order the items.", closedT:"This questionnaire is closed", notOpenT:"Not open yet",
           closedB:"Thank you for your interest. The response window for this questionnaire has ended.",
           doneT:"Response already submitted", pct:"complete",
           closedDeadlineB:"The response deadline for this questionnaire was {date}. Thank you for your interest.",
           notOpenB:"This questionnaire is not open for responses yet.",
           viewResp:"View my response", backSummary:"Done", cairo:"Cairo time",
           readonlyNote:"Read-only — the response period has ended.",
           closesIn:"Closes in",
           previewNote:"PREVIEW — nothing is saved or sent", noQuestions:"This survey has no visible questions yet." },
      ar:{ start:"بدء الاستبيان", next:"التالي", back:"السابق", submit:"إرسال الردّ",
           saveLater:"حفظ والمتابعة لاحقًا", saved:"تم حفظ تقدّمك", section:"القسم",
           of:"من", welcome:"دعوة", required:"هذا السؤال مطلوب",
           reqChoose:"يرجى اختيار إجابة", reqEmail:"يرجى إدخال بريد إلكتروني صحيح",
           other:"أخرى (يرجى التحديد)", yes:"نعم", no:"لا", est:"الزمن التقديري",
           deadline:"آخر موعد للردّ", print:"طباعة / حفظ إجاباتي", edit:"تعديل ردّي",
           reviewSubmitting:"جارٍ الإرسال…", resumed:"مرحبًا بعودتك — تمت استعادة إجاباتك السابقة.",
           rankHint:"استخدم الأسهم لترتيب العناصر.", closedT:"هذا الاستبيان مغلق", notOpenT:"غير متاح بعد",
           closedB:"نشكركم على اهتمامكم. انتهت فترة استقبال الردود لهذا الاستبيان.",
           doneT:"تم إرسال الردّ مسبقًا", pct:"مكتمل",
           closedDeadlineB:"انتهى الموعد النهائي للردّ على هذا الاستبيان بتاريخ {date}. نشكركم على اهتمامكم.",
           notOpenB:"هذا الاستبيان غير متاح لاستقبال الردود بعد.",
           viewResp:"عرض ردّي", backSummary:"تم", cairo:"بتوقيت القاهرة",
           readonlyNote:"للقراءة فقط — انتهت فترة الردّ.",
           closesIn:"يُغلق خلال",
           previewNote:"معاينة — لا يتم حفظ أو إرسال أي شيء", noQuestions:"لا توجد أسئلة ظاهرة في هذا الاستبيان بعد." }
    };

    // Server clock offset, so countdowns do not depend on the respondent's own clock.
    var skew = CTX.server_now ? (Date.parse(CTX.server_now) - Date.now()) : 0;
    function nowMs(){ return Date.now() + (isNaN(skew) ? 0 : skew); }
    var PREVIEW = CTX.mode === 'preview';

    var state = {
      lang: CTX.lang || SURVEY.default_lang || 'en',
      step: 0,                 // 0 = welcome, 1..N = sections, N+1 = thank you
      answers: CTX.answers || {},
      // Hidden questions are skipped (their stored answers are kept server-side);
      // a section whose questions are all hidden disappears.
      sections: (SURVEY.sections || []).map(function(s){
        return Object.assign({}, s, { questions: (s.questions || []).filter(function(q){ return !q.hidden; }) });
      }).filter(function(s){ return s.questions.length; }),
      submitted: !!CTX.already_complete,
      viewing: false           // read-only walk-through of a submitted response after the deadline
    };
    function readOnly(){ return !!(CTX.closed && state.submitted); }
    var SVG = {
      check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
      checkThin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
      up:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>',
      down:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
      arrow:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
      clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
      cal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
      org:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-3"/></svg>',
      lock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>',
      disk:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="8 12 11 15 16 9"/></svg>'
    };

    function t(k){ return (T[state.lang]||T.en)[k]; }
    function L(obj){ if(obj==null) return ''; if(typeof obj==='string') return obj; return obj[state.lang]||obj.en||obj.ar||''; }
    var root = document.getElementById('root');

    /* ---------- rendering ---------- */
    function applyDir(){
      var rtl = state.lang==='ar';
      document.documentElement.dir = rtl?'rtl':'ltr';
      document.documentElement.lang = state.lang;
      document.title = L(SURVEY.title) || 'Survey';
      document.getElementById('brand-title').textContent = rtl ? 'الأجهزة العليا للرقابة · استبيانات' : 'SAI Egypt · Surveys';
      document.getElementById('brand-sub').textContent = rtl ? 'منصة الاستبيانات المؤسسية' : 'Institutional Survey Platform';
      [].forEach.call(document.querySelectorAll('#langToggle button'),function(b){
        b.classList.toggle('on', b.getAttribute('data-l')===state.lang);
      });
    }

    function setProgress(){
      var total = state.sections.length;
      var pct;
      if(state.step===0) pct=0;
      else if(state.step>total) pct=100;
      else pct = Math.round((state.step/ (total+ (0))) *100) - 0;
      if(state.step>0 && state.step<=total) pct = Math.round((state.step-1)/total*100)+Math.round(1/total*50);
      if(state.step>total) pct=100;
      document.getElementById('progressFill').style.width = (state.step===0?0:pct)+'%';
    }

    function render(){
      applyDir();
      if(PREVIEW) showPreviewRibbon();
      if(CTX.closed && !state.submitted){ renderClosed(); return; }
      if(!state.sections.length){ renderNotice(t('noQuestions'),'',SVG.lock); return; }
      if(state.step===0) renderWelcome();
      else if(state.step>state.sections.length) renderThankYou();
      else renderSection(state.step-1);
      setProgress();
      window.scrollTo({top:0,behavior:'smooth'});
    }

    function renderNotice(title,body,icon){
      var old=document.querySelector('.navbar'); if(old) old.remove();
      root.innerHTML = '<div class="notice">'+icon+'<h2>'+esc(title)+'</h2><p>'+esc(body)+'</p></div>';
    }

    function renderClosed(){
      var body = t('closedB'), title = t('closedT');
      if(CTX.closed_reason==='deadline' && CTX.deadline) body = t('closedDeadlineB').replace('{date}', fmtDeadline(CTX.deadline));
      else if(CTX.closed_reason==='draft'){ title = t('notOpenT'); body = t('notOpenB'); }
      renderNotice(title, body, SVG.lock);
      document.getElementById('progressFill').style.width = '0%';
    }
    // The server rejected a save because the survey closed while the form was open.
    function markClosed(j){
      CTX.closed = true; CTX.closed_reason = (j && j.reason) || 'status';
      if(j && j.deadline){ CTX.deadline = j.deadline; SURVEY.deadline = j.deadline; }
      render();
    }
    function showPreviewRibbon(){
      var r=document.getElementById('previewRibbon');
      if(!r){ r=document.createElement('div'); r.id='previewRibbon'; r.className='preview-ribbon'; document.body.appendChild(r); }
      r.textContent=t('previewNote');
    }
    function countPhrase(n, unit){
      if(state.lang!=='ar') return n+' '+unit+(n===1?'':'s');
      var W = unit==='day' ? ['يوم واحد','يومين','أيام','يومًا'] : ['ساعة واحدة','ساعتين','ساعات','ساعة'];
      return n===1 ? W[0] : n===2 ? W[1] : n<=10 ? n+' '+W[2] : n+' '+W[3];
    }
    // "Closes in N days" once 7 days or fewer remain (hours when under a day).
    function closesHint(){
      if(!SURVEY.deadline || CTX.closed) return '';
      var ms = Date.parse(SURVEY.deadline) - nowMs();
      if(isNaN(ms) || ms<=0 || ms>7*864e5) return '';
      var phrase = ms < 864e5 ? countPhrase(Math.max(1,Math.ceil(ms/36e5)),'hour') : countPhrase(Math.ceil(ms/864e5),'day');
      return t('closesIn')+' '+phrase;
    }

    function renderWelcome(){
      var intro = SURVEY.intro||{};
      var inv = CTX.invitation;
      var badge = '';
      if(inv){
        var nm = state.lang==='ar' ? (inv.sai_name_ar||inv.sai_name) : inv.sai_name;
        badge = '<div class="hero-badge">'+SVG.org+'<span>'+esc(nm)+'</span></div>';
      }
      var body = (intro.body||[]).map(function(p){return '<p>'+esc(L(p))+'</p>';}).join('');
      var chips = '';
      if(intro.estimated_time) chips += chip(SVG.clock, t('est'), L(intro.estimated_time));
      if(SURVEY.deadline) chips += chip(SVG.cal, t('deadline'), fmtDeadline(SURVEY.deadline));
      var hint = closesHint();
      var resumed = (CTX.resumed) ? '<div class="save-note" style="margin:0 0 18px">'+SVG.disk+esc(t('resumed'))+'</div>' : '';

      root.innerHTML =
        '<div></div>'+
        '<div class="stage"><div class="panel">'+
          resumed+ badge+
          '<h1 class="hero-title serif">'+esc(L(intro.title)||L(SURVEY.title))+'</h1>'+
          (intro.subtitle?'<p class="hero-sub">'+esc(L(intro.subtitle))+'</p>':'')+
          '<div class="intro-body">'+body+'</div>'+
          '<div class="meta-chips">'+chips+'</div>'+
          (hint?'<div class="deadline-hint">'+SVG.clock+'<span>'+esc(hint)+'</span></div>':'')+
        '</div></div>';
      renderNav({back:false, nextLabel:t('start')});
    }
    function chip(icon,label,val){
      return '<div class="chip">'+icon+'<div><div class="cl">'+esc(label)+'</div><div class="cv">'+esc(val)+'</div></div></div>';
    }

    function renderSection(idx){
      var sec = state.sections[idx];
      var total = state.sections.length;
      var rail = '<nav class="rail"><ol>'+ state.sections.map(function(s,i){
        var cls = i<idx?'done':(i===idx?'active':'');
        var dot = i<idx? SVG.checkThin : (i+1);
        return '<li class="'+cls+'"><span class="dot">'+dot+'</span><span>'+esc(shortTitle(s))+'</span></li>';
      }).join('')+'</ol></nav>';

      var mdots = '<div class="m-dots">'+state.sections.map(function(s,i){
        return '<i class="'+(i<idx?'done':(i===idx?'active':''))+'"></i>';
      }).join('')+'</div>';
      var mind = '<div class="m-indicator"><span class="s">'+t('section')+' '+(idx+1)+' '+t('of')+' '+total+'</span>'+mdots+'</div>';

      var qs = sec.questions.map(function(q,qi){ return renderQuestion(q, idx, qi); }).join('');

      root.innerHTML = rail +
        '<div class="stage">'+ mind +
          '<div class="panel">'+
            '<div class="eyebrow">'+t('section')+' '+(idx+1)+' / '+total+'</div>'+
            '<h2 class="sec-title serif">'+esc(stripSectionPrefix(L(sec.title)))+'</h2>'+
            '<div class="qwrap">'+qs+'</div>'+
          '</div>'+
        '</div>';

      bindSection(sec, idx);
      var last = idx===total-1;
      if(readOnly()){ applyReadOnly(); renderNav({back:true, nextLabel: last? t('backSummary'): t('next'), submit:false}); return; }
      renderNav({back:true, nextLabel: last? t('submit'): t('next'), submit:last});
    }

    // After the deadline a submitted response can still be read, but not changed.
    function applyReadOnly(){
      [].forEach.call(root.querySelectorAll('input,textarea,select,button[data-rk]'),function(el){ el.disabled=true; });
      [].forEach.call(root.querySelectorAll('.opts,.rank-list,.matrix'),function(el){ el.style.pointerEvents='none'; });
      var panel=root.querySelector('.panel');
      if(panel){ var n=document.createElement('div'); n.className='save-note'; n.style.cssText='margin:0 0 16px;opacity:1';
        n.innerHTML=SVG.lock+esc(t('readonlyNote')); panel.insertBefore(n,panel.firstChild); }
    }

    function renderQuestion(q, si, qi){
      var num = (typeof q._num==='number')? q._num : '';
      var req = q.required? '<span class="q-req">*</span>':'';
      var head = '<div class="q-head"><span class="q-num">'+ (q.displayNum||'') +'</span><div><div class="q-label">'+esc(L(q.label))+req+'</div>'+
                 (q.type==='ranking'?'<div class="q-hint">'+t('rankHint')+'</div>':'')+'</div></div>';
      var body = '';
      var a = state.answers;
      switch(q.type){
        case 'short_text': body='<input type="text" data-q="'+q.id+'" value="'+escAttr(a[q.id]||'')+'">'; break;
        case 'email': body='<input type="email" data-q="'+q.id+'" value="'+escAttr(a[q.id]||'')+'" placeholder="name@example.org">'; break;
        case 'phone': body='<input type="tel" data-q="'+q.id+'" value="'+escAttr(a[q.id]||'')+'" placeholder="+20 ...">'; break;
        case 'long_text': body='<textarea data-q="'+q.id+'">'+esc(a[q.id]||'')+'</textarea>'; break;
        case 'single_choice': body=renderChoices(q,'radio'); break;
        case 'multiple_choice': body=renderChoices(q,'check'); break;
        case 'yes_no': body=renderYesNo(q); break;
        case 'ranking': body=renderRanking(q); break;
        case 'matrix': body=renderMatrix(q); break;
        default: body='';
      }
      return '<div class="q" data-qid="'+q.id+'" data-type="'+q.type+'" data-required="'+(q.required?1:0)+'">'+
               head+body+'<div class="err-msg" data-err="'+q.id+'"></div></div>';
    }

    function renderChoices(q, kind){
      var a = state.answers, sel = a[q.id];
      var selArr = Array.isArray(sel)? sel : (sel!=null?[sel]:[]);
      var opts = (q.options||[]).map(function(o){
        var on = selArr.indexOf(o.value)>=0;
        return optRow(q.id, o.value, L(o.label), kind, on);
      }).join('');
      var other='';
      if(q.allow_other){
        var on = selArr.indexOf('__other__')>=0;
        other = optRow(q.id,'__other__', t('other'), kind, on)+
          '<div class="opt-other-input" '+(on?'':'style="display:none"')+' data-otherwrap="'+q.id+'">'+
          '<input type="text" data-other="'+q.id+'" value="'+escAttr(a[q.id+'__other']||'')+'"></div>';
      }
      return '<div class="opts" data-opts="'+q.id+'" data-kind="'+kind+'">'+opts+other+'</div>';
    }
    function optRow(qid,val,label,kind,on){
      var boxInner = kind==='check'? SVG.check : '';
      return '<label class="opt'+(on?' sel':'')+'" data-val="'+escAttr(val)+'">'+
        '<span class="box '+(kind==='radio'?'radio':'check')+'">'+boxInner+'</span>'+
        '<span class="otxt">'+esc(label)+'</span></label>';
    }

    function renderYesNo(q){
      var a=state.answers, sel=a[q.id];
      var opts = [['yes',t('yes')],['no',t('no')]].map(function(o){
        return optRow(q.id,o[0],o[1],'radio',sel===o[0]);
      }).join('');
      var fu='';
      if(q.followup){
        var show = sel===(q.followup_if||'yes');
        fu='<div data-fuwrap="'+q.id+'" '+(show?'':'style="display:none"')+' style="margin-top:14px">'+
           '<div class="q-label" style="font-size:14.5px;font-weight:500;margin-bottom:9px">'+esc(L(q.followup.label))+'</div>'+
           '<textarea data-fu="'+q.id+'">'+esc(a[q.id+'_followup']||'')+'</textarea></div>';
      }
      return '<div class="opts" data-opts="'+q.id+'" data-kind="radio" data-yesno="1">'+opts+'</div>'+fu;
    }

    function renderRanking(q){
      var a=state.answers;
      var items = (q.items||[]).slice();
      var order = a[q.id];
      if(Array.isArray(order) && order.length){
        items.sort(function(x,y){
          var ix=order.indexOf(x.value), iy=order.indexOf(y.value);
          if(ix<0)ix=99; if(iy<0)iy=99; return ix-iy;
        });
      }
      var rows = items.map(function(it,i){
        var otherInput = it.is_other? '<input type="text" data-rankother="'+q.id+'" placeholder="'+escAttr(t('other'))+'" value="'+escAttr(a[q.id+'__other']||'')+'">':'';
        return '<div class="rank-item" data-val="'+escAttr(it.value)+'">'+
          '<span class="rb">'+(i+1)+'</span>'+
          '<div class="rl">'+esc(L(it.label))+otherInput+'</div>'+
          '<div class="rank-ctrl"><button data-rk="up" '+(i===0?'disabled':'')+'>'+SVG.up+'</button>'+
          '<button data-rk="down" '+(i===items.length-1?'disabled':'')+'>'+SVG.down+'</button></div></div>';
      }).join('');
      return '<div class="rank-list" data-rank="'+q.id+'">'+rows+'</div>';
    }

    function renderMatrix(q){
      var a=state.answers; var mv=a[q.id]||{};
      var head='<tr><th></th>'+(q.columns||[]).map(function(c){return '<th>'+esc(L(c.label))+'</th>';}).join('')+'</tr>';
      var body=(q.rows||[]).map(function(r){
        var cells=(q.columns||[]).map(function(c){
          var on = mv[r.value]===c.value;
          return '<td><span class="mrad'+(on?' on':'')+'" data-mrow="'+escAttr(r.value)+'" data-mcol="'+escAttr(c.value)+'"></span></td>';
        }).join('');
        return '<tr><td>'+esc(L(r.label))+'</td>'+cells+'</tr>';
      }).join('');
      return '<table class="matrix" data-matrix="'+q.id+'"><thead>'+head+'</thead><tbody>'+body+'</tbody></table>';
    }

    /* ---------- interactions ---------- */
    function bindSection(sec, idx){
      // text-ish inputs
      [].forEach.call(root.querySelectorAll('[data-q]'),function(el){
        el.addEventListener('input',function(){ state.answers[el.getAttribute('data-q')]=el.value; scheduleSave(); });
      });
      [].forEach.call(root.querySelectorAll('[data-other]'),function(el){
        el.addEventListener('input',function(){ state.answers[el.getAttribute('data-other')+'__other']=el.value; scheduleSave(); });
      });
      [].forEach.call(root.querySelectorAll('[data-fu]'),function(el){
        el.addEventListener('input',function(){ state.answers[el.getAttribute('data-fu')+'_followup']=el.value; scheduleSave(); });
      });
      [].forEach.call(root.querySelectorAll('[data-rankother]'),function(el){
        el.addEventListener('input',function(){ state.answers[el.getAttribute('data-rankother')+'__other']=el.value; scheduleSave(); });
      });

      // choices
      [].forEach.call(root.querySelectorAll('[data-opts]'),function(group){
        var qid=group.getAttribute('data-opts'), kind=group.getAttribute('data-kind'), yesno=group.getAttribute('data-yesno');
        [].forEach.call(group.querySelectorAll('.opt'),function(opt){
          opt.addEventListener('click',function(e){
            e.preventDefault();
            var val=opt.getAttribute('data-val');
            if(kind==='radio'){
              [].forEach.call(group.querySelectorAll('.opt'),function(o){o.classList.remove('sel');});
              opt.classList.add('sel');
              state.answers[qid]=val;
              if(yesno){ toggleFollowup(qid, val); }
              var ow=group.querySelector('[data-otherwrap="'+qid+'"]');
              if(ow) ow.style.display = val==='__other__'?'block':'none';
            } else {
              var cur = Array.isArray(state.answers[qid])? state.answers[qid].slice():[];
              var i=cur.indexOf(val);
              if(i>=0){cur.splice(i,1);opt.classList.remove('sel');}
              else{cur.push(val);opt.classList.add('sel');}
              state.answers[qid]=cur;
              if(val==='__other__'){
                var w=group.querySelector('[data-otherwrap="'+qid+'"]');
                if(w) w.style.display = cur.indexOf('__other__')>=0?'block':'none';
              }
            }
            clearErr(qid); scheduleSave();
          });
        });
        // other wrap for radio-with-other (single choice)
      });

      // ranking
      [].forEach.call(root.querySelectorAll('[data-rank]'),function(list){
        var qid=list.getAttribute('data-rank');
        list.addEventListener('click',function(e){
          var btn=e.target.closest('[data-rk]'); if(!btn)return;
          var item=btn.closest('.rank-item'); var dir=btn.getAttribute('data-rk');
          if(dir==='up' && item.previousElementSibling) list.insertBefore(item,item.previousElementSibling);
          if(dir==='down' && item.nextElementSibling) list.insertBefore(item.nextElementSibling,item);
          reindexRank(list,qid); scheduleSave();
        });
        reindexRank(list,qid);
      });

      // matrix
      [].forEach.call(root.querySelectorAll('[data-matrix]'),function(tbl){
        var qid=tbl.getAttribute('data-matrix');
        [].forEach.call(tbl.querySelectorAll('.mrad'),function(cell){
          cell.addEventListener('click',function(){
            var rowv=cell.getAttribute('data-mrow'), colv=cell.getAttribute('data-mcol');
            [].forEach.call(tbl.querySelectorAll('.mrad[data-mrow="'+rowv+'"]'),function(c){c.classList.remove('on');});
            cell.classList.add('on');
            var mv=state.answers[qid]||{}; mv[rowv]=colv; state.answers[qid]=mv; scheduleSave();
          });
        });
      });
    }

    function toggleFollowup(qid,val){
      var w=root.querySelector('[data-fuwrap="'+qid+'"]'); if(!w)return;
      var q=findQ(qid);
      w.style.display = (val===((q&&q.followup_if)||'yes'))?'block':'none';
    }
    function reindexRank(list,qid){
      var items=list.querySelectorAll('.rank-item'); var order=[];
      [].forEach.call(items,function(it,i){
        it.querySelector('.rb').textContent=i+1;
        var up=it.querySelector('[data-rk="up"]'), dn=it.querySelector('[data-rk="down"]');
        up.disabled=i===0; dn.disabled=i===items.length-1;
        order.push(it.getAttribute('data-val'));
      });
      state.answers[qid]=order;
    }

    /* ---------- validation ---------- */
    function validateSection(idx){
      var sec=state.sections[idx]; var ok=true; var firstBad=null;
      sec.questions.forEach(function(q){
        var qEl=root.querySelector('.q[data-qid="'+q.id+'"]');
        if(qEl) qEl.classList.remove('invalid');
        if(!q.required) return;
        var v=state.answers[q.id]; var bad=false;
        if(q.type==='multiple_choice'){ bad=!Array.isArray(v)||v.length===0; }
        else if(q.type==='matrix'){ bad=!v||Object.keys(v).length< (q.rows||[]).length; }
        else if(q.type==='email'){ bad=!v || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v); }
        else { bad = v==null || v===''; }
        if(bad){
          ok=false;
          if(qEl){ qEl.classList.add('invalid');
            var em=qEl.querySelector('[data-err]');
            if(em) em.textContent = q.type==='email'?t('reqEmail'):(/choice|matrix|yes/.test(q.type)?t('reqChoose'):t('required'));
            if(!firstBad) firstBad=qEl;
          }
        }
      });
      if(firstBad) firstBad.scrollIntoView({behavior:'smooth',block:'center'});
      return ok;
    }
    function clearErr(qid){ var qEl=root.querySelector('.q[data-qid="'+qid+'"]'); if(qEl)qEl.classList.remove('invalid'); }

    /* ---------- navigation ---------- */
    function renderNav(opts){
      var old=document.querySelector('.navbar'); if(old)old.remove();
      var nav=document.createElement('div'); nav.className='navbar';
      var saveBtn = (state.step>0 && state.step<=state.sections.length && CTX.mode==='invitation')
        ? '<button class="btn-text" id="navSave">'+t('saveLater')+'</button>' : '';
      nav.innerHTML='<div class="navbar-inner">'+
        (opts.back?'<button class="btn btn-ghost nav-back" id="navBack"><span style="transform:rotate(180deg);display:inline-flex">'+SVG.arrow+'</span>'+t('back')+'</button>':'<span></span>')+
        saveBtn+
        '<span class="spacer"></span>'+
        '<span class="save-note" id="saveNote" style="opacity:0">'+SVG.disk+t('saved')+'</span>'+
        '<button class="btn btn-primary nav-next" id="navNext">'+esc(opts.nextLabel)+(opts.submit?'':' <span class="nav-next">'+SVG.arrow+'</span>')+'</button>'+
      '</div>';
      document.body.appendChild(nav);
      var nx=document.getElementById('navNext');
      nx.addEventListener('click',function(){
        if(opts.submit){ doSubmit(); }
        else if(state.step===0){ state.step=1; render(); }
        else { if(readOnly() || validateSection(state.step-1)){ state.step++; render(); } }
      });
      var bk=document.getElementById('navBack');
      if(bk) bk.addEventListener('click',function(){ if(state.step>0){state.step--;render();} });
      var sv=document.getElementById('navSave');
      if(sv) sv.addEventListener('click',function(){ saveNow(true); });
    }

    /* ---------- save / submit ---------- */
    var saveTimer=null, lastSaved=0;
    function scheduleSave(){
      if(PREVIEW || readOnly()) return;
      try{ localStorage.setItem('scei_draft_'+SURVEY.slug, JSON.stringify({answers:state.answers,lang:state.lang,ts:Date.now()})); }catch(e){}
      if(CTX.mode!=='invitation') return;
      clearTimeout(saveTimer);
      saveTimer=setTimeout(function(){ saveNow(false); }, 1500);
    }
    function saveNow(announce){
      if(CTX.mode!=='invitation'){ if(announce) toast(t('saved')); return; }
      postResponse(false).then(function(){
        if(announce){ toast(t('saved')); }
        var n=document.getElementById('saveNote'); if(n){n.style.opacity=1;setTimeout(function(){n.style.opacity=0;},1800);}
      }).catch(function(){});
    }
    function postResponse(complete){
      var payload={ survey_slug:SURVEY.slug, token:(CTX.invitation&&CTX.invitation.token)||null,
        code:(CTX.link&&CTX.link.code)||null,
        draft_key:getDraftKey(), lang:state.lang, answers:state.answers, is_complete:complete };
      return fetch(API+'/api/response',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
        .then(function(r){
          if(r.status===403){
            return r.json().catch(function(){ return {}; }).then(function(j){
              if(j.error==='survey_closed'){ markClosed(j); throw new Error('closed'); }
              throw new Error('save failed');
            });
          }
          if(!r.ok) throw new Error('save failed');
          return r.json();
        });
    }
    function getDraftKey(){
      try{ var k=localStorage.getItem('scei_dk_'+SURVEY.slug);
        if(!k){ k=(Date.now().toString(36)+Math.random().toString(36).slice(2,8)); localStorage.setItem('scei_dk_'+SURVEY.slug,k);} return k;
      }catch(e){ return null; }
    }
    function doSubmit(){
      if(!validateSection(state.step-1)) return;
      if(PREVIEW){ state.submitted=true; state.step=state.sections.length+1; render(); return; }
      var nx=document.getElementById('navNext'); if(nx){nx.disabled=true;nx.textContent=t('reviewSubmitting');}
      postResponse(true).then(function(){
        state.submitted=true;
        try{ localStorage.removeItem('scei_draft_'+SURVEY.slug);}catch(e){}
        state.step=state.sections.length+1; render();
      }).catch(function(e){
        if(e && e.message==='closed') return;     // the closed screen is already showing
        if(nx){nx.disabled=false;nx.textContent=t('submit');}
        toast(state.lang==='ar'?'تعذّر الإرسال، حاول مرة أخرى':'Submission failed, please retry');
      });
    }

    function renderThankYou(){
      var ty=SURVEY.thank_you||{};
      document.querySelector('.navbar') && document.querySelector('.navbar').remove();
      root.innerHTML='<div></div><div class="stage"><div class="panel ty">'+
        '<div class="seal">'+SVG.check+'</div>'+
        '<h2 class="serif">'+esc(L(ty.title)||'Thank you')+'</h2>'+
        '<p>'+esc(L(ty.body))+'</p>'+
        '<div class="actions">'+
          '<button class="btn btn-ghost" onclick="window.print()">'+t('print')+'</button>'+
          (CTX.mode==='invitation' && !CTX.closed?'<button class="btn btn-text" id="editBtn">'+t('edit')+'</button>':'')+
          (readOnly()?'<button class="btn btn-text" id="viewBtn">'+t('viewResp')+'</button>':'')+
        '</div></div></div>';
      document.getElementById('progressFill').style.width='100%';
      var vb=document.getElementById('viewBtn');
      if(vb) vb.addEventListener('click',function(){ state.step=1; render(); });
      var eb=document.getElementById('editBtn');
      if(eb) eb.addEventListener('click',function(){ state.submitted=false; state.step=1; render(); });
    }

    /* ---------- helpers ---------- */
    function findQ(id){ for(var i=0;i<state.sections.length;i++){var qs=state.sections[i].questions;for(var j=0;j<qs.length;j++)if(qs[j].id===id)return qs[j];} return null; }
    function shortTitle(s){ var x=stripSectionPrefix(L(s.title)); return x.length>26?x.slice(0,25)+'…':x; }
    function stripSectionPrefix(x){ return (x||'').replace(/^(Section\s+[IVX0-9]+\s*[—:-]\s*|القسم\s+\S+\s*[—:-]\s*)/,''); }
    // Date in Cairo time; the time of day is shown only when it is not the default end of day (23:59).
    function fmtDeadline(iso){
      try{
        var d=new Date(iso); if(isNaN(d.getTime())) return iso;
        var loc=state.lang==='ar'?'ar-EG':'en-GB';
        var date=d.toLocaleDateString(loc,{timeZone:'Africa/Cairo',year:'numeric',month:'long',day:'numeric'});
        var hm=d.toLocaleTimeString('en-GB',{timeZone:'Africa/Cairo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
        if(hm==='23:59') return date;
        var time=d.toLocaleTimeString(loc,{timeZone:'Africa/Cairo',hour:'2-digit',minute:'2-digit'})+' ('+t('cairo')+')';
        // Arabic: isolate the time phrase (RLI..PDI) so the digits and the bracket keep their order next to the date.
        return state.lang==='ar' ? date+'\u060c \u2067'+time+'\u2069' : date+', '+time;
      }catch(e){ return iso; }
    }
    function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
    function escAttr(s){ return esc(s).replace(/"/g,'&quot;'); }
    var toastTimer;
    function toast(msg){ var el=document.getElementById('toast'); el.textContent=msg; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(function(){el.classList.remove('show');},2600); }

    // assign display numbers to questions (continuous across sections)
    (function(){ var n=0; state.sections.forEach(function(s){ s.questions.forEach(function(q){ n++; q.displayNum=n; }); }); })();

    // restore local draft if no server answers
    (function(){
      if(!PREVIEW && (!CTX.answers || Object.keys(CTX.answers).length===0)){
        try{ var raw=localStorage.getItem('scei_draft_'+SURVEY.slug);
          if(raw){ var d=JSON.parse(raw); if(d&&d.answers&&Object.keys(d.answers).length){ state.answers=d.answers; if(d.lang)state.lang=d.lang; CTX.resumed=true; } }
        }catch(e){}
      }
    })();

    document.getElementById('langToggle').addEventListener('click',function(e){
      var b=e.target.closest('button'); if(!b)return;
      state.lang=b.getAttribute('data-l'); scheduleSave(); render();
    });

    if(state.submitted){ state.step=state.sections.length+1; }
    render();
  }

  /* ---------- router / boot ---------- */
  var rootEl = document.getElementById('root');

  function message(titleEn, bodyEn, titleAr, bodyAr, retry){
    document.title = titleEn;
    var lt = document.getElementById('langToggle'); if(lt) lt.style.display = 'none';
    rootEl.innerHTML = '<div></div><div class="stage"><div class="panel ty">'+
      '<h2 class="serif">'+titleEn+'</h2><p>'+bodyEn+'</p>'+
      '<div dir="rtl" lang="ar" style="margin-top:22px;padding-top:22px;border-top:1px solid var(--line-soft);font-family:var(--arab)">'+
      '<h2>'+titleAr+'</h2><p>'+bodyAr+'</p></div>'+
      (retry ? '<div class="actions" style="margin-top:22px"><button class="btn btn-ghost" id="retryBtn">Retry / إعادة المحاولة</button></div>' : '')+
      '</div></div>';
    var rb = document.getElementById('retryBtn'); if(rb) rb.onclick = function(){ location.reload(); };
  }
  function notFound(generic){
    if(generic) message('Page not found','The page you are looking for does not exist.',
      'الصفحة غير موجودة','الصفحة التي تبحث عنها غير موجودة.');
    else message('Invitation link not found',
      'This link may be invalid or expired. Please check the link in your invitation, or contact the Committee secretariat.',
      'الرابط غير موجود',
      'قد يكون هذا الرابط غير صحيح أو منتهي الصلاحية. يرجى مراجعة الرابط الوارد في دعوتكم أو التواصل مع أمانة اللجنة.');
  }

  // Admin "Preview": /survey.html#preview inside an iframe receives the draft definition
  // from the admin page (same origin only) and renders it without saving anything.
  function waitForPreview(){
    var started = false;
    rootEl.innerHTML = '<div></div><div class="stage"><div class="panel ty"><p>Loading preview…</p></div></div>';
    window.addEventListener('message', function(e){
      if(e.origin !== location.origin || started) return;
      var d = e.data;
      if(!d || d.type !== 'survey-preview' || !d.definition) return;
      started = true;
      startSurvey({ survey: d.definition, mode: 'preview', invitation: null, answers: null,
        lang: d.lang || d.definition.default_lang || 'en', already_complete: false, closed: false });
    });
    if(window.parent !== window) window.parent.postMessage({ type: 'survey-preview-ready' }, location.origin);
  }

  function boot(){
    if(/\/survey\.html$/.test(location.pathname) && location.hash === '#preview'){ waitForPreview(); return; }
    var m = location.pathname.match(/^\/(i|s|c)\/([^\/]+)\/?$/);
    if(!m){ notFound(true); return; }
    var base = { i: '/api/invitation/', s: '/api/survey/', c: '/api/link/' }[m[1]];
    var url = API + base + encodeURIComponent(decodeURIComponent(m[2]));
    fetch(url, { headers: { 'Accept': 'application/json' } }).then(function(r){
      if(r.status === 404){ notFound(false); return null; }
      if(!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function(ctx){
      if(ctx) startSurvey(ctx);
    }).catch(function(){
      message('Unable to load the questionnaire','Please check your connection and try again.',
        'تعذّر تحميل الاستبيان','يرجى التحقق من الاتصال بالإنترنت والمحاولة مرة أخرى.', true);
    });
  }
  boot();
})();
