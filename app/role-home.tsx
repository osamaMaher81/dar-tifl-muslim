'use client';
import {
    ArrowUpLeft,
    BookMarked,
    BookOpen,
    CalendarCheck,
    Check,
    Clock,
    GraduationCap,
    MessagesSquare,
    Users,
    Wallet
} from 'lucide-react';
import {learningSummary} from '@/lib/learning';
import {Progress} from '@/components/ui/progress';

const money = (n: number) => new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP'
}).format((n || 0) / 100);
const day = () => new Date().toISOString().slice(0, 10);
const date = (v: string) => new Date(v + 'T12:00:00').toLocaleDateString('ar-EG', {day: 'numeric', month: 'long'});
export default function RoleHome({
                                     user,
                                     students,
                                     circles,
                                     records,
                                     assignments,
                                     users,
                                     childId,
                                     onChooseChild,
                                     onNavigate,
                                     onOpen,
                                     onComplete,
                                     busy
                                 }: any) {
    const teacher = user.role === 'sheikh';
    const parent = user.role === 'parent';
    const child = students.find((s: any) => s.id === childId) || students[0];
    const personal = teacher ? records : records.filter((r: any) => r.student_id === child?.id);
    const plans = personal.filter((r: any) => r.kind === 'plan');
    const tasks = plans.filter((r: any) => r.status === 'assigned');
    const done = plans.filter((r: any) => r.status === 'completed');
    const attendance = personal.filter((r: any) => r.kind === 'attendance');
    const present = attendance.filter((r: any) => ['حاضر', 'متأخر'].includes(r.data.attendance));
    const balance = personal.filter((r: any) => r.kind === 'subscription').reduce((n: number, r: any) => n + r.amount, 0) - personal.filter((r: any) => r.kind === 'payment').reduce((n: number, r: any) => n + r.amount, 0);
    const openAttendance = records.find((r: any) => r.kind === 'staff_attendance' && r.status === 'open' && r.user_id === user.id);
    const circle = circles.find((c: any) => c.id === child?.circle_id);
    const teacherNames = (cid: string) => (assignments || []).filter((a: any) => a.circle_id === cid).map((a: any) => users.find((u: any) => u.id === a.user_id)?.name).filter(Boolean).join('، ') || 'تحدده الإدارة';
    const quick = (title: string, Icon: any, fn: any) => <button className="role-quick" onClick={fn}><Icon
        size={23}/><strong>{title}</strong><ArrowUpLeft size={16}/></button>;
    return <div className={`role-home role-${user.role}`}>
        {teacher ? <>
            <section className="teacher-clock panel"><span className="tile-icon"><Clock size={28}/></span>
                <div><h2>{openAttendance ? 'أنت مسجل حضور الآن' : 'حضور حلقاتك'}</h2>
                    <p>{openAttendance ? `بداية الحضور: ${new Date(openAttendance.data.check_in).toLocaleTimeString('ar-EG', {
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Africa/Cairo'
                    })}` : 'اختر الحلقة عند الحضور، ثم سجل الانصراف. تُحتسب حلقة واحدة تلقائيًا.'}</p></div>
                <button className="primary" onClick={() => onOpen('staff_attendance', {
                    mode: openAttendance ? 'out' : 'in',
                    sessions: 1
                })}>{openAttendance ? 'تسجيل انصراف' : 'تسجيل حضور'}</button>
            </section>
            <div className="role-stats"><Metric icon={BookOpen} title="حلقاتي" value={circles.length}/><Metric
                icon={Users} title="طلابي" value={students.length}/><Metric icon={CalendarCheck} title="حضور اليوم"
                                                                            value={attendance.filter((r: any) => r.date === day()).length}/><Metric
                icon={BookMarked} title="تسميع اليوم"
                value={personal.filter((r: any) => ['memorization', 'revision'].includes(r.kind) && r.date === day()).length}/>
            </div>
            <div
                className="role-quick-grid">{quick('تسجيل حضور طالب', CalendarCheck, () => onOpen('attendance', {attendance: 'حاضر'}))}{quick('تسجيل حفظ جديد', BookMarked, () => onOpen('memorization'))}{quick('تسجيل مراجعة', BookOpen, () => onOpen('revision'))}{quick('المطلوب القادم', Check, () => onOpen('plan'))}</div>
            <section className="panel">
                <div className="panel-head">
                    <div><h2>حلقاتي وطلابي</h2><p>اختَر الطالب لبدء تسجيل جلسته</p></div>
                    <button className="text-btn" onClick={() => onNavigate('circles')}>مواعيد الحلقات <ArrowUpLeft
                        size={16}/></button>
                </div>
                {circles.length ? circles.map((c: any) => <div className="teacher-roster" key={c.id}>
                        <div className="spread"><h3>{c.name}</h3><small>{c.schedule}</small></div>
                        {students.filter((s: any) => s.circle_id === c.id).map((s: any) => <div className="roster-row"
                                                                                                key={s.id}><span
                            className="avatar">{s.name[0]}</span>
                            <div><strong>{s.name}</strong><small>{s.level}</small></div>
                            <button className="secondary"
                                    onClick={() => onOpen('attendance', {student_id: s.id, attendance: 'حاضر'})}>حضور
                            </button>
                            <button className="primary" onClick={() => onOpen('memorization', {student_id: s.id})}>تسميع
                            </button>
                        </div>)}{!students.some((s: any) => s.circle_id === c.id) &&
                        <p className="muted">لا يوجد طلاب في هذه الحلقة بعد.</p>}</div>) :
                    <div className="empty"><GraduationCap size={34}/><h3>حسابك جاهز، وفي انتظار إسناد الحلقات</h3>
                        <p>تربط الإدارة حسابك بالحلقات من قسم الحسابات والربط.</p></div>}</section>
            <div
                className="role-quick-grid mt-6">{quick('حضوري ومستحقاتي', Wallet, () => onNavigate('staff'))}{quick('مصروف جديد', Wallet, () => onOpen('expense'))}{quick('رسالة للحلقة', MessagesSquare, () => onOpen('message'))}</div>
        </> : <>
            {parent && students.length > 0 &&
                <section className="children-strip" aria-label="اختيار الابن">{students.map((s: any) => <button
                    key={s.id} className={child?.id === s.id ? 'selected' : ''} onClick={() => onChooseChild(s.id)}
                    aria-pressed={child?.id === s.id}><span
                    className="avatar">{s.name[0]}</span><span><strong>{s.name}</strong><small>{s.level}</small></span>
                </button>)}</section>}
            {!child ? <section className="panel empty"><Users size={36}/>
                <h2>{parent ? 'في انتظار ربط أبنائك' : 'في انتظار ربط ملفك'}</h2><p>حسابك مفعّل. تربط الإدارة الحساب
                    بملف الطالب بعد التحقق من البيانات، ثم تظهر الحلقات والحفظ والاشتراكات هنا.</p>
                <button className="secondary" onClick={() => onOpen('message')}>تواصل مع الإدارة</button>
            </section> : <>
                <section className="learner-banner"><span className="avatar large">{child.name[0]}</span>
                    <div><span className="eyebrow">{parent ? 'متابعة ابني' : 'رحلتي مع القرآن'}</span>
                        <h2>{child.name}</h2><p>{child.level} · {circle?.name || 'في انتظار تحديد الحلقة'}</p>
                        <small>الشيخ: {teacherNames(child.circle_id)}</small></div>
                    <div className="learner-schedule"><Clock
                        size={19}/><span>{circle?.schedule || 'تحدد الإدارة المواعيد'}</span></div>
                </section>
                <div className="dashboard-grid">
                    <section className="panel">
                        <div className="panel-head">
                            <div><h2>المطلوب للحلقة القادمة</h2>
                                <p>{parent ? 'تابع المطلوب مع ابنك قبل موعد الحلقة' : 'كل خطوة صغيرة تقرّبك من هدفك'}</p>
                            </div>
                            <BookMarked size={23}/></div>
                        <div className="task-list">{tasks.length > 3 &&
                            <button className="text-btn" onClick={() => onNavigate('learning')}>عرض كل التكليفات
                                ({tasks.length})</button>}{tasks.length ? tasks.slice(0, 3).map((r: any) => <article
                                key={r.id}>
                                <div className="spread"><strong>سورة {r.data.surah}</strong><span
                                    className="badge">{r.data.plan_type || 'حفظ جديد'}</span></div>
                                <p>من الآية {r.data.from} إلى الآية {r.data.to}</p><small>موعد
                                التسميع: {date(r.data.due)}</small>{r.data.notes && <p>{r.data.notes}</p>}{!parent &&
                                <button disabled={busy} className="primary" onClick={() => onComplete(r.id)}><Check
                                    size={17}/> أنجزت المطلوب</button>}</article>) :
                            <div className="empty"><Check size={28}/><h3>لا توجد تكليفات معلقة</h3><p>أي تكليف جديد
                                يسجله الشيخ سيظهر هنا.</p></div>}</div>
                    </section>
                    <section className="panel">
                        <div className="panel-head"><h2>آخر متابعة من الشيخ</h2>
                            <button className="text-btn" onClick={() => onNavigate('learning')}>السجل كاملًا</button>
                        </div>
                        <div
                            className="task-list">{personal.filter((r: any) => ['memorization', 'revision', 'assessment', 'note'].includes(r.kind)).slice(0, 2).map((r: any) =>
                            <article key={r.id}><span className="badge">{({
                                memorization: 'حفظ جديد',
                                revision: 'مراجعة',
                                assessment: 'تقييم',
                                note: 'ملاحظة'
                            } as any)[r.kind]}</span><p>{learningSummary(r.kind, r.data)}</p>{r.data.notes &&
                                <small>{r.data.notes}</small>}<small>{date(r.date)}</small>
                            </article>)}{!personal.some((r: any) => ['memorization', 'revision', 'assessment', 'note'].includes(r.kind)) &&
                            <div className="empty"><BookOpen size={28}/><p>تظهر هنا نتيجة التسميع والمراجعة وملاحظات
                                الشيخ.</p></div>}</div>
                    </section>
                </div>
                <details className="calm-details">
                    <summary>الحضور والاشتراك وملخص الإنجاز</summary>
                    <div className="calm-details-body">
                        <div className="role-stats"><Metric icon={BookMarked} title="تكليفات مكتملة"
                                                            value={`${done.length} / ${plans.length}`}/><Metric
                            icon={CalendarCheck} title="نسبة الحضور المسجل"
                            value={attendance.length ? Math.round(present.length / attendance.length * 100) + '%' : '—'}/><Metric
                            icon={BookOpen} title="سجلات الحفظ"
                            value={personal.filter((r: any) => r.kind === 'memorization').length}/><Metric icon={Wallet}
                                                                                                           title="الاشتراك المتبقي"
                                                                                                           value={money(Math.max(0, balance))}/>
                        </div>
                        <section className="panel padded">
                            <div className="spread"><h2>إنجاز خطة الحفظ</h2>
                                <strong>{plans.length ? Math.round(done.length / plans.length * 100) : 0}%</strong>
                            </div>
                            <Progress className="mt-4"
                                      value={plans.length ? done.length / plans.length * 100 : 0}/><small
                            className="mt-3">{done.length} تكليف مكتمل من إجمالي {plans.length} · يعتمد الإنجاز على
                            تعليم الطالب للتكليف كمكتمل.</small></section>
                    </div>
                </details>
                <div
                    className="role-quick-grid mt-6">{quick('الحضور والانصراف', CalendarCheck, () => onNavigate('attendance'))}{quick('الاشتراكات والمدفوعات', Wallet, () => onNavigate('finance'))}{quick('التواصل مع الدار', MessagesSquare, () => onOpen('message'))}</div>
            </>}
        </>}
    </div>;
}

function Metric({title, value, icon: Icon}: any) {
    return <div className="stat-card">
        <div className="spread"><span>{title}</span><span className="stat-icon teal"><Icon size={20}/></span></div>
        <h2>{value}</h2></div>;
}
