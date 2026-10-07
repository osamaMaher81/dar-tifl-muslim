'use client';
import React, {useEffect, useRef, useState} from 'react';
import {ArrowRight, BookOpen, Check, ChevronLeft, Clock, LoaderCircle, Save, Search} from 'lucide-react';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {toast} from 'sonner';
import {learningSummary, planTypes, ratings} from '@/lib/learning';

const cairoDay = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
}).format(new Date());
const clock = () => new Date().toLocaleTimeString('en-GB', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    minute: '2-digit'
});
const titles: any = {memorization: 'تسميع الجديد', revision: 'تسميع الماضي', plan: 'مطلوب الحلقة القادمة'};

function Picker({value, onChange, options, label}: any) {
    return <Select dir="rtl" value={value || '__none'}
                   onValueChange={v => onChange(v === '__none' ? '' : v)}><SelectTrigger aria-label={label}><SelectValue
        placeholder={label}/></SelectTrigger><SelectContent><SelectItem
        value="__none">{label}</SelectItem>{options.map((o: any) => <SelectItem key={o.id}
                                                                                value={o.id}>{o.name}</SelectItem>)}
    </SelectContent></Select>;
}

export default function TeacherLesson({state, refresh, call, onOpen}: any) {
    const circles = state.circles.filter((c: any) => c.status === 'active' && state.assignments.some((a: any) => a.circle_id === c.id && a.user_id === state.user.id));
    const [circle, setCircle] = useState(circles[0]?.id || ''), [day, setDay] = useState(cairoDay), [studentId, setStudentId] = useState(''), [query, setQuery] = useState(''), [drafts, setDrafts] = useState<any>({}), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const saving = useRef(false), heading = useRef<HTMLHeadingElement>(null);
    const students = state.students.filter((s: any) => s.circle_id === circle && s.status === 'active').sort((a: any, b: any) => a.name.localeCompare(b.name, 'ar'));
    const student = students.find((s: any) => s.id === studentId), key = studentId + '|' + day,
        draft = drafts[key] || {};
    const records = state.records.filter((r: any) => r.status !== 'void'),
        saved = records.filter((r: any) => r.student_id === studentId && r.date === day);
    const attendance = saved.find((r: any) => r.kind === 'attendance'),
        present = ['حاضر', 'متأخر'].includes(attendance?.data.attendance || draft.attendance);
    const open = records.find((r: any) => r.kind === 'staff_attendance' && r.user_id === state.user.id && r.status === 'open');
    const closed = records.some((r: any) => r.kind === 'staff_attendance' && r.user_id === state.user.id && r.circle_id === circle && r.date === cairoDay());
    const done = students.filter((s: any) => records.some((r: any) => r.student_id === s.id && r.date === day && r.kind === 'attendance')).length;
    const dirty = Object.keys(drafts).length > 0;
    useEffect(() => {
        const warn = (e: BeforeUnloadEvent) => {
            if (dirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    function update(v: any) {
        setDrafts((old: any) => ({...old, [key]: {...old[key], ...v}}));
        setError('');
    }

    function choose(id: string) {
        setStudentId(id);
        setError('');
        requestAnimationFrame(() => heading.current?.focus());
    }

    async function staff() {
        if (saving.current) return;
        saving.current = true;
        setBusy(true);
        try {
            await call('staff_attendance', {mode: open ? 'out' : 'in', circle_id: circle});
            await refresh();
            toast.success(open ? 'تم إنهاء الحلقة وتسجيل الانصراف' : 'تم تسجيل حضورك للحلقة');
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            saving.current = false;
            setBusy(false);
        }
    }

    async function save(e: React.FormEvent) {
        e.preventDefault();
        if (saving.current) return;
        saving.current = true;
        setBusy(true);
        setError('');
        try {
            const payload: any = {student_id: student.id, circle_id: circle, date: day};
            if (!attendance) payload.attendance = {
                attendance: draft.attendance,
                check_in: draft.check_in || '',
                check_out: draft.check_out || ''
            };
            const entries = (draft.entries || []).filter((x: any) => x.kind === 'plan' || present);
            if (entries.length) payload.entries = entries;
            if (Object.keys(payload).length === 3) {
                toast.info('لا توجد بيانات جديدة للحفظ');
                return;
            }
            await call('lesson', payload);
            setDrafts((old: any) => {
                const copy = {...old};
                delete copy[key];
                return copy;
            });
            await refresh();
            toast.success('تم حفظ متابعة ' + student.name);
        } catch (e: any) {
            setError(e.message);
        } finally {
            saving.current = false;
            setBusy(false);
        }
    }

    const next = students[students.findIndex((s: any) => s.id === studentId) + 1];
    return <div className="lesson-workspace">
        <section className="lesson-controls panel"><label>الحلقة<Picker value={circle} onChange={(v: string) => {
            setCircle(v);
            setStudentId('');
            setQuery('');
            setError('');
        }} options={circles} label="اختر الحلقة"/></label><label>تاريخ المتابعة<input type="date" value={day}
                                                                                      onChange={e => {
                                                                                          setDay(e.target.value);
                                                                                          setError('');
                                                                                      }} required/></label>
            <div className="lesson-count"><strong>{done} / {students.length}</strong><span>تم تسجيل حضورهم</span></div>
        </section>
        <section className="lesson-clock"><Clock size={22}/>
            <div>
                <strong>{open ? 'أنت حاضر الآن في ' + (state.circles.find((c: any) => c.id === open.circle_id)?.name || 'الحلقة') : closed ? 'تم تسجيل حضورك لهذه الحلقة اليوم' : 'سجّل حضورك للحلقة اليوم'}</strong><small>مرتب
                الحلقات يُحسب من حضورك وانصرافك، وليس من عدد الطلاب.</small></div>
            <button className={open ? 'secondary' : 'primary'} disabled={busy || !circle || (!open && closed)}
                    onClick={staff}>{open ? 'إنهاء الحلقة والانصراف' : closed ? 'الحضور مسجل' : 'بدء الحلقة'}</button>
        </section>
        {!circles.length ?
            <div className="panel empty"><BookOpen/><h2>لم تُسند إليك حلقة نشطة بعد</h2><p>تواصل مع الإدارة لإسناد
                حلقتك.</p></div> : <div className={'lesson-columns ' + (student ? 'has-student' : '')}>
                <aside className="lesson-roster panel">
                    <div className="lesson-roster-head"><h2>طلاب الحلقة</h2><span>{students.length} طالب</span></div>
                    <div className="searchbox"><Search size={18}/><input aria-label="ابحث عن طالب"
                                                                         placeholder="ابحث باسم الطالب" value={query}
                                                                         onChange={e => setQuery(e.target.value)}/>
                    </div>
                    <div
                        className="lesson-student-list">{students.filter((s: any) => s.name.includes(query)).map((s: any) => {
                        const a = records.find((r: any) => r.student_id === s.id && r.date === day && r.kind === 'attendance');
                        return <button key={s.id} className={'lesson-student ' + (studentId === s.id ? 'selected' : '')}
                                       onClick={() => choose(s.id)} aria-pressed={studentId === s.id}><span
                            className="lesson-initial">{s.name.slice(0, 1)}</span><span><strong>{s.name}</strong><small>{drafts[s.id + '|' + day] ? 'تعديلات لم تُحفظ' : a?.data.attendance || 'لم يُسجل بعد'}</small></span>{a ?
                            <Check size={18}/> : <ChevronLeft size={18}/>}</button>;
                    })}{!students.length && <p className="lesson-empty">لا يوجد طلاب نشطون في هذه
                        الحلقة.</p>}{students.length > 0 && !students.some((s: any) => s.name.includes(query)) &&
                        <p className="lesson-empty">لا يوجد طالب بهذا الاسم.</p>}</div>
                </aside>
                {!student ? <section className="lesson-placeholder panel"><BookOpen size={32}/><h2>اختر طالبًا لبدء
                        المتابعة</h2><p>سجّل حضوره وتسميعه والمطلوب القادم في مكان واحد.</p></section> :
                    <form className="lesson-card panel" onSubmit={save}>
                        <header className="lesson-card-head">
                            <button type="button" className="text-btn" onClick={() => setStudentId('')}><ArrowRight
                                size={18}/> الطلاب
                            </button>
                            <h2 ref={heading} tabIndex={-1}>{student.name}</h2><span>{student.level}</span></header>
                        <fieldset disabled={busy} className="lesson-fields">
                            <section className="lesson-block"><h3><span>١</span> حضور الطالب</h3>{attendance ?
                                <div className="lesson-saved"><Check
                                    size={17}/><span>{attendance.data.attendance} {attendance.data.check_in && ' · ' + attendance.data.check_in} {attendance.data.check_out && ' — ' + attendance.data.check_out}</span>{['حاضر', 'متأخر'].includes(attendance.data.attendance) && !attendance.data.check_out &&
                                    <button type="button" className="text-btn"
                                            onClick={() => onOpen('checkout', {id: attendance.id, time: clock()})}>تسجيل
                                        انصراف</button>}</div> : <>
                                    <div className="lesson-attendance" role="group"
                                         aria-label="حالة حضور الطالب">{['حاضر', 'متأخر', 'غائب', 'بعذر'].map(v =>
                                        <button type="button" key={v} aria-pressed={draft.attendance === v}
                                                className={draft.attendance === v ? 'selected' : ''}
                                                onClick={() => update({attendance: v})}>{v}</button>)}</div>
                                    {present && <details className="lesson-times">
                                        <summary>وقت الحضور والانصراف (اختياري)</summary>
                                        <div className="lesson-range"><label>الحضور<input type="time"
                                                                                          value={draft.check_in || ''}
                                                                                          onChange={e => update({check_in: e.target.value})}/></label><label>الانصراف<input
                                            type="time" value={draft.check_out || ''}
                                            onChange={e => update({check_out: e.target.value})}/></label></div>
                                    </details>}</>}</section>
                            {[
                                {id: 'memorization', kind: 'memorization', title: 'تسميع الجديد'},
                                {id: 'near', kind: 'revision', type: 'ماضي قريب', title: 'الماضي القريب (اختياري)'},
                                {id: 'far', kind: 'revision', type: 'ماضي بعيد', title: 'الماضي البعيد (اختياري)'},
                                {id: 'assessment', kind: 'assessment', title: 'الاختبار (اختياري)'},
                                {id: 'plan', kind: 'plan', title: 'مطلوب الحلقة القادمة'}
                            ].map((group, i) => {
                                const rows = saved.filter((r: any) => r.kind === group.kind && (!group.type || r.data.revision_type === group.type || (!r.data.revision_type && group.id === 'near')));
                                const entries = (draft.entries || []).filter((x: any) => x.kind === group.kind && (!group.type || x.data.revision_type === group.type));
                                const allowed = group.kind === 'plan' || present;
                                return <section className="lesson-block" key={group.id}>
                                    <div className="lesson-block-title"><h3><span>{i + 2}</span>{group.title}</h3></div>
                                    {rows.map((r: any) => <div className="lesson-saved" key={r.id}><Check
                                        size={17}/><span>{learningSummary(r.kind, r.data)}{r.data.notes &&
                                        <small>{r.data.notes}</small>}</span>
                                    </div>)}{allowed && entries.map((entry: any, index: number) => <LearningEntry
                                    key={entry.key} entry={entry} index={index} day={day}
                                    onChange={(data: any) => update({
                                        entries: draft.entries.map((x: any) => x.key === entry.key ? {
                                            ...x,
                                            data
                                        } : x)
                                    })}
                                    onRemove={() => update({entries: draft.entries.filter((x: any) => x.key !== entry.key)})}/>)}{allowed ?
                                    <button type="button" className="secondary lesson-add" onClick={() => update({
                                        entries: [...(draft.entries || []), {
                                            key: crypto.randomUUID(),
                                            kind: group.kind,
                                            data: {...(group.type ? {revision_type: group.type} : {}), ...(group.kind === 'plan' ? {plan_type: 'جديد'} : {})}
                                        }]
                                    })}>+ {group.kind === 'assessment' ? 'إضافة اختبار' : group.kind === 'plan' ? 'إضافة مطلوب' : 'إضافة مقطع'}</button> :
                                    <p className="lesson-hint">متاح للطالب الحاضر أو المتأخر.</p>}</section>;
                            })}

                        </fieldset>
                        {error && <p className="form-error" role="alert">{error}</p>}
                        <div className="lesson-save">
                            <button className="primary" disabled={busy || (!attendance && !draft.attendance)}
                                    type="submit">{busy ? <LoaderCircle className="animate-spin" size={18}/> :
                                <Save size={18}/>} حفظ المتابعة
                            </button>
                            {next && <button className="secondary" type="button" disabled={busy}
                                             onClick={() => choose(next.id)}>الطالب التالي <ChevronLeft size={18}/>
                            </button>}<small
                            role="status">{drafts[key] ? 'التعديلات لم تُحفظ بعد' : 'السجلات المحفوظة تظهر للطالب وولي أمره'}</small>
                        </div>
                    </form>}</div>}
    </div>;
}

function LearningEntry({entry, index, day, onChange, onRemove}: any) {
    const v = entry.data, kind = entry.kind;
    const set = (name: string, value: string) => onChange({...v, [name]: value});
    return <div className="learning-entry">
        <div className="spread"><strong>{kind === 'assessment' ? 'اختبار' : 'مقطع'} {index + 1}</strong>
            <button type="button" className="text-btn danger-text" onClick={onRemove}>إزالة</button>
        </div>
        <div className="lesson-learning">
            {kind === 'plan' &&
                <label>نوع المطلوب<Picker value={v.plan_type} onChange={(x: string) => set('plan_type', x)}
                                          options={planTypes.map(x => ({id: x, name: x}))}
                                          label="نوع المطلوب"/></label>}
            {kind === 'assessment' ?
                <div className="lesson-range"><label>من سورة<input required maxLength={120} value={v.from_surah || ''}
                                                                   onChange={e => set('from_surah', e.target.value)}/></label><label>إلى
                    سورة<input required maxLength={120} value={v.to_surah || ''}
                               onChange={e => set('to_surah', e.target.value)}/></label></div> : <><label>السورة<input
                    required maxLength={120} value={v.surah || ''} onChange={e => set('surah', e.target.value)}
                    placeholder="اسم السورة"/></label>
                    <div className="lesson-range"><label>من آية<input required type="number" inputMode="numeric" min="1"
                                                                      max="286" value={v.from || ''}
                                                                      onChange={e => set('from', e.target.value)}/></label><label>إلى
                        آية<input required type="number" inputMode="numeric" min={v.from || 1} max="286"
                                  value={v.to || ''} onChange={e => set('to', e.target.value)}/></label></div>
                </>}
            {['memorization', 'revision'].includes(kind) &&
                <label>التقدير<Picker value={v.rating} onChange={(x: string) => set('rating', x)}
                                      options={ratings.map(x => ({id: x, name: x}))} label="اختر التقدير"/></label>}
            {['revision', 'assessment'].includes(kind) &&
                <label>{kind === 'revision' ? 'النسبة المئوية (اختياري)' : 'نتيجة الاختبار ٪'}<input type="number"
                                                                                                     min="0" max="100"
                                                                                                     step="0.01"
                                                                                                     inputMode="decimal"
                                                                                                     required={kind === 'assessment'}
                                                                                                     value={(kind === 'assessment' ? v.score : v.percentage) ?? ''}
                                                                                                     onChange={e => set(kind === 'assessment' ? 'score' : 'percentage', e.target.value)}/></label>}
            {kind === 'plan' && <label>موعد الحلقة القادمة<input required type="date" min={day} value={v.due || ''}
                                                                 onChange={e => set('due', e.target.value)}/></label>}
            <details>
                <summary>ملاحظات (اختياري)</summary>
                <textarea aria-label="ملاحظات المقطع" maxLength={1000} rows={2} value={v.notes || ''}
                          onChange={e => set('notes', e.target.value)}/></details>
        </div>
    </div>;
}
