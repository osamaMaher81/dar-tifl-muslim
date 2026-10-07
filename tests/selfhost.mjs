import assert from 'node:assert/strict';
import {pbkdf2Sync} from 'node:crypto';
import {database, sqlite} from '../runtime/storage.mjs';

if (!process.env.DATA_DIR?.includes('selfhost-test')) throw new Error('Only run against isolated selfhost-test DATA_DIR');
const mf = {dispatchFetch: fetch};
const db = {
    prepare(sql) {
        let stmt = database().prepare(sql);
        return {
            bind(...args) {
                stmt = stmt.bind(...args);
                return this
            }, async run() {
                return stmt.run()
            }, async first() {
                return stmt.first()
            }
        }
    }
};
const pass = 'Temporary-test-only-731';
let checks = 0;
let signupCircle = '';
const testPhoto = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5ioAAAAASUVORK5CYII=';

async function req(action, data = {}, cookie = '', expected = 200, headers = {}) {
    if (action === 'register') data = {username: 'test_' + data.phone, photo: testPhoto, ...data};
    if (action === 'register' && ['student', 'parent'].includes(data.role)) data = {
        circle_id: signupCircle,
        branch: 'الفرع الرئيسي',
        child_name: 'Test child', ...data
    };
    const r = await mf.dispatchFetch('http://127.0.0.1:3105/api/app', {
        method: 'POST',
        headers: {'content-type': 'application/json', origin: 'http://127.0.0.1:3105', cookie, ...headers},
        body: JSON.stringify({action, data})
    });
    const body = await r.json();
    assert.equal(r.status, expected, action + ': ' + JSON.stringify(body));
    checks++;
    return {...body, cookie: r.headers.get('set-cookie')?.split(';')[0]};
}

async function state(cookie = '') {
    const r = await mf.dispatchFetch('http://127.0.0.1:3105/api/app', {headers: {cookie}});
    assert.equal(r.status, 200);
    checks++;
    return r.json();
}

try {
    const initial = await state();
    assert.equal(initial.setup, true);
    await req('setup', {
        name: 'Test administrator',
        phone: '01000000000',
        password: pass,
        confirm: pass,
        role: 'student'
    }, '', 403);
    const salt = crypto.randomUUID();
    const hashed = salt + ':' + pbkdf2Sync(pass, salt, 100000, 32, 'sha256').toString('hex');
    sqlite().prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?)').run('academy-owner', 'Test administrator', '+201000000000', hashed, 'admin', 'active', null, '{}', new Date().toISOString());
    const a = await req('login', {phone: '01000000000', password: pass});
    const admin = a.cookie;
    assert.ok(admin);
    signupCircle = (await req('circle', {
        name: 'Signup circle',
        level: 'أول',
        type: 'حضوري',
        schedule: 'السبت',
        capacity: 20,
        status: 'active',
        teachers: []
    }, admin)).id;
    for (const [role, phone] of [['sheikh', '01000000001'], ['student', '01000000002'], ['parent', '01000000003'], ['parent', '01000000004']]) await req('register', {
        name: `Test ${role} ${phone}`,
        phone,
        password: pass,
        confirm: pass,
        role
    });
    await req('login', {phone: '01000000002', password: pass}, '', 403);
    let data = await state(admin);
    const teacher = data.users.find(x => x.role === 'sheikh'), student = data.users.find(x => x.role === 'student'),
        parent = data.users.find(x => x.phone === '+201000000003'),
        outsider = data.users.find(x => x.phone === '+201000000004');
    for (const u of [teacher, student, parent, outsider]) await req('account', {id: u.id, status: 'active'}, admin);
    const teacherCookie = (await req('login', {phone: teacher.phone, password: pass})).cookie;
    const studentCookie = (await req('login', {phone: student.phone, password: pass})).cookie;
    const parentCookie = (await req('login', {phone: parent.phone, password: pass})).cookie;
    const outsiderCookie = (await req('login', {phone: outsider.phone, password: pass})).cookie;
    const circle = await req('circle', {
        name: 'Test circle',
        level: 'أول',
        type: 'حضوري',
        schedule: 'السبت 5 مساء',
        capacity: 1,
        status: 'active',
        teachers: [teacher.id]
    }, admin);
    const pupil = await req('student', {
        name: 'Test pupil',
        level: 'أول',
        circle_id: circle.id,
        status: 'active'
    }, admin);
    const unlinked = await req('student', {name: 'Other pupil', level: 'أول', status: 'active'}, admin);
    await req('student', {name: 'Too many', level: 'أول', circle_id: circle.id}, admin, 400);
    for (const who of [student, parent]) await req('link', {user_id: who.id, student_id: pupil.id}, admin);
    await req('link', {user_id: student.id, student_id: unlinked.id}, admin, 400);
    assert.equal((await state(parentCookie)).students.length, 1);
    assert.equal((await state(outsiderCookie)).students.length, 0);
    await req('record', {
        kind: 'attendance',
        student_id: unlinked.id,
        date: '2026-09-16',
        data: {attendance: 'حاضر'}
    }, teacherCookie, 403);
    await req('record', {
        kind: 'attendance',
        student_id: pupil.id,
        date: '2026-09-16',
        data: {attendance: 'حاضر', check_in: '15:00', check_out: '16:00'}
    }, teacherCookie);
    await req('record', {
        kind: 'attendance',
        student_id: pupil.id,
        date: '2026-09-16',
        data: {attendance: 'حاضر'}
    }, teacherCookie, 400);
    await req('record', {
        kind: 'memorization',
        student_id: pupil.id,
        date: '2026-09-16',
        data: {surah: 'النبأ', from: 1, to: 10, grade: 95}
    }, teacherCookie);
    await req('record', {
        kind: 'revision',
        student_id: pupil.id,
        date: '2026-09-16',
        data: {surah: 'الإخلاص', from: 1, to: 4, grade: 90}
    }, teacherCookie);
    const plan = await req('record', {
        kind: 'plan',
        student_id: pupil.id,
        date: '2026-09-16',
        data: {surah: 'النبأ', from: 11, to: 20, due: '2026-09-20'}
    }, teacherCookie);
    await req('record_status', {id: plan.id, status: 'completed'}, studentCookie);
    assert.ok((await state(parentCookie)).records.some(r => r.id === plan.id && r.status === 'completed'));
// Unified lesson: permissions, atomic validation, retry safety, and shared visibility.
    const lesson = {
        student_id: pupil.id,
        circle_id: circle.id,
        date: '2026-09-18',
        attendance: {attendance: 'حاضر'},
        memorization: {surah: 'النبأ', from: 1, to: 10, grade: 95},
        revision: {surah: 'الإخلاص', from: 1, to: 4, grade: 90},
        plan: {surah: 'النبأ', from: 11, to: 20, due: '2026-09-20'}
    };
    await req('lesson', lesson, parentCookie, 403);
    await req('lesson', {...lesson, student_id: unlinked.id}, teacherCookie, 403);
    await req('lesson', {...lesson, plan: {...lesson.plan, to: 0}}, teacherCookie, 400);
    assert.equal((await state(admin)).records.filter(r => r.student_id === pupil.id && r.date === lesson.date).length, 0);
    await req('lesson', lesson, teacherCookie);
    await req('lesson', lesson, teacherCookie);
    let lessonRows = (await state(parentCookie)).records.filter(r => r.student_id === pupil.id && r.date === lesson.date && ['attendance', 'memorization', 'revision', 'plan'].includes(r.kind));
    assert.equal(lessonRows.length, 4);
    assert.equal(lessonRows.find(r => r.kind === 'memorization').data.grade, 95);
    await req('lesson', {...lesson, memorization: {...lesson.memorization, grade: 75}}, teacherCookie, 409);
    await req('lesson', {...lesson, date: '2026-09-19', attendance: {attendance: 'غائب'}}, teacherCookie, 400);
    assert.equal((await state(admin)).records.filter(r => r.student_id === pupil.id && r.date === '2026-09-19').length, 0);
    await req('lesson', {
        student_id: pupil.id,
        circle_id: circle.id,
        date: '2026-09-19',
        attendance: {attendance: 'حاضر'}
    }, teacherCookie);
    await req('lesson', {
        student_id: pupil.id,
        circle_id: circle.id,
        date: '2026-09-19',
        revision: lesson.revision
    }, teacherCookie);
    assert.equal((await state(studentCookie)).records.filter(r => r.student_id === pupil.id && r.date === '2026-09-19' && r.kind === 'revision').length, 1);
// Multiple optional revision segments, typed plans, and percentage-only exams.
    const entry = (kind, data) => ({key: crypto.randomUUID(), kind, data});
    const entries = [entry('memorization', {
        surah: 'النبأ',
        from: 1,
        to: 5,
        rating: 'ممتاز'
    }), entry('revision', {
        surah: 'الناس',
        from: 1,
        to: 6,
        rating: 'جيد جدا',
        revision_type: 'ماضي قريب'
    }), entry('revision', {
        surah: 'الفلق',
        from: 1,
        to: 5,
        rating: 'جيد مرتفع',
        revision_type: 'ماضي قريب',
        percentage: 0
    }), entry('revision', {
        surah: 'الإخلاص',
        from: 1,
        to: 4,
        rating: 'إعادة',
        revision_type: 'ماضي بعيد',
        percentage: 65
    }), entry('assessment', {
        from_surah: 'النبأ',
        to_surah: 'الناس',
        score: 88.5
    }), ...['جديد', 'ماضي قريب', 'ماضي بعيد'].map(plan_type => entry('plan', {
        surah: 'النبأ',
        from: 6,
        to: 10,
        plan_type,
        due: '2026-09-27'
    }))];
    const multi = {
        student_id: pupil.id,
        circle_id: circle.id,
        date: '2026-09-25',
        attendance: {attendance: 'حاضر'},
        entries
    };
    await req('lesson', {
        ...multi,
        entries: [entry('assessment', {from_surah: 'النبأ', to_surah: 'الناس', score: ''})]
    }, teacherCookie, 400);
    await req('lesson', {
        ...multi,
        entries: [entry('revision', {
            surah: 'الناس',
            from: 1,
            to: 6,
            revision_type: 'ماضي قريب',
            rating: 'ممتاز',
            percentage: 101
        })]
    }, teacherCookie, 400);
    await req('lesson', multi, teacherCookie);
    await req('lesson', multi, teacherCookie);
    let mr = (await state(parentCookie)).records.filter(r => r.date === multi.date && r.student_id === pupil.id);
    assert.equal(mr.filter(r => r.kind === 'revision').length, 3);
    assert.equal(mr.filter(r => r.kind === 'plan').length, 3);
    assert.equal(mr.find(r => r.kind === 'assessment').data.score, 88.5);
    assert.ok(mr.some(r => r.data.percentage === 0));
    assert.ok(mr.some(r => r.kind === 'revision' && r.data.percentage === undefined));
    await req('lesson', {
        student_id: pupil.id,
        circle_id: circle.id,
        date: multi.date,
        entries: [entry('revision', {surah: 'الكوثر', from: 1, to: 3, revision_type: 'ماضي بعيد', rating: 'متوسط'})]
    }, teacherCookie);
    assert.equal((await state(studentCookie)).records.filter(r => r.date === multi.date && r.kind === 'revision').length, 4);
// Assistants require admin approval, receive circle-scoped access and independent payroll.
    await req('register', {
        name: 'Test assistant',
        phone: '01000000031',
        password: pass,
        confirm: pass,
        role: 'assistant',
        circle_id: circle.id,
        branch: 'الفرع الرئيسي'
    });
    await req('login', {phone: '01000000031', password: pass}, '', 403);
    const ar = (await state(admin)).requests.find(r => r.phone === '+201000000031');
    assert.ok(ar);
    assert.ok(!(await state(teacherCookie)).requests.some(r => r.id === ar.id));
    await req('review_registration', {id: ar.id, decision: 'approved', verified: true}, teacherCookie, 403);
    await assert.rejects(() => db.prepare("UPDATE records SET status='approved',data=json_set(data,'$.reviewer_id',?) WHERE id=?").bind(teacher.id, ar.id).run());
    await req('review_registration', {id: ar.id, decision: 'approved', verified: true}, admin);
    await req('review_registration', {id: ar.id, decision: 'approved', verified: true}, admin, 409);
    const helper = (await req('login', {phone: '01000000031', password: pass, expected_role: 'assistant'})).cookie;
    const hs = await state(helper);
    assert.equal(hs.user.role, 'assistant');
    assert.equal(hs.students.length, 1);
    assert.equal(hs.circles[0].id, circle.id);
    assert.equal(hs.requests.length, 0);
    await req('lesson', {student_id: unlinked.id, circle_id: circle.id, date: multi.date, entries: []}, helper, 403);
    await req('lesson', {
        student_id: pupil.id,
        circle_id: circle.id,
        date: multi.date,
        entries: [entry('revision', {surah: 'العصر', from: 1, to: 3, rating: 'جيد', revision_type: 'ماضي قريب'})]
    }, helper);
    await req('review_registration', {id: ar.id, decision: 'approved', verified: true}, helper, 403);
    await req('record', {
        kind: 'salary_config',
        user_id: hs.user.id,
        date: '2026-09-01',
        data: {method: 'session', rate: 75}
    }, admin);
    await req('record', {
        kind: 'salary_config',
        user_id: hs.user.id,
        date: '2026-09-01',
        data: {method: 'session', rate: 500}
    }, helper, 403);
    await req('staff_attendance', {mode: 'absent', circle_id: circle.id, date: '2026-09-02'}, helper);
    await req('staff_attendance', {mode: 'in', circle_id: circle.id}, helper);
    await req('staff_attendance', {mode: 'out'}, helper);
    const helperSalary = await req('salary', {user_id: hs.user.id, month: '2026-09'}, admin);
    assert.equal((await state(helper)).records.find(r => r.id === helperSalary.id).amount, 7500);
    assert.ok(!(await state(teacherCookie)).records.some(r => r.id === helperSalary.id));
    await req('register', {
        name: 'Rejected assistant',
        phone: '01000000032',
        password: pass,
        confirm: pass,
        role: 'assistant',
        circle_id: circle.id,
        branch: 'الفرع الرئيسي'
    });
    const rejectedHelper = (await state(admin)).requests.find(r => r.phone === '+201000000032');
    await req('review_registration', {id: rejectedHelper.id, decision: 'rejected'}, admin);
    await req('login', {phone: '01000000032', password: pass}, '', 403);
    const sub = await req('record', {
        kind: 'subscription',
        student_id: pupil.id,
        date: '2026-09-01',
        amount: 200,
        data: {title: 'September', due: '2026-09-01'}
    }, admin);
    await req('record', {
        kind: 'payment',
        student_id: pupil.id,
        parent_id: sub.id,
        amount: 75,
        date: '2026-09-16',
        data: {method: 'نقدي'}
    }, admin);
    await req('record', {
        kind: 'payment',
        student_id: pupil.id,
        parent_id: sub.id,
        amount: 200,
        date: '2026-09-16',
        data: {method: 'نقدي'}
    }, admin, 400);
    await req('settings', {restrict_access: true, overdue_days: 0}, admin);
    assert.ok((await state(parentCookie)).restrictions.some(r => r.restricted));
    assert.ok(!(await state(parentCookie)).records.some(r => r.kind === 'memorization'));
    await req('record', {
        kind: 'payment',
        student_id: pupil.id,
        parent_id: sub.id,
        amount: 125,
        date: '2026-09-16',
        data: {method: 'محفظة إلكترونية'}
    }, admin);
    assert.ok((await state(parentCookie)).records.some(r => r.kind === 'memorization'));
    const ex = await req('record', {
        kind: 'expense',
        amount: 50,
        date: '2026-09-16',
        data: {reason: 'Test supplies', category: 'مستلزمات تعليمية'}
    }, teacherCookie);
    await req('record_status', {id: ex.id, status: 'approved'}, teacherCookie, 403);
    await req('record_status', {id: ex.id, status: 'approved'}, admin);
    await req('record', {
        kind: 'salary_config',
        user_id: teacher.id,
        date: '2026-09-01',
        data: {method: 'monthly', fixed: 1000, rate: 0}
    }, admin);
    await req('staff_attendance', {mode: 'in', circle_id: circle.id}, teacherCookie);
    await req('staff_attendance', {mode: 'out', sessions: 2}, teacherCookie);
    const salary = await req('salary', {user_id: teacher.id, month: '2026-09', additions: 25, deductions: 10}, admin);
    assert.equal((await state(admin)).records.find(r => r.id === salary.id).amount, 106500);
    await req('salary', {user_id: teacher.id, month: '2026-09'}, admin, 400);
    const waiting = await req('record', {
        kind: 'waitlist',
        student_id: unlinked.id,
        circle_id: circle.id,
        date: '2026-09-16',
        data: {}
    }, admin);
    await req('student', {id: pupil.id, name: 'Test pupil', level: 'أول', circle_id: '', status: 'active'}, admin);
    assert.equal((await state(admin)).records.find(r => r.id === waiting.id).status, 'notified');
    await req('student', {
        id: unlinked.id,
        name: 'Other pupil',
        level: 'أول',
        circle_id: circle.id,
        status: 'active'
    }, admin);
    await req('record_status', {id: waiting.id, status: 'closed'}, admin);
    await req('account', {id: outsider.id, status: 'suspended'}, admin);
    await req('record', {kind: 'message', data: {text: 'not allowed'}}, outsiderCookie, 401);
    const pub = await req('record', {
        kind: 'content',
        status: 'published',
        data: {category: 'أخبار', title: 'Test news', text: 'News content'}
    }, admin);
    const publicResponse = await mf.dispatchFetch('http://127.0.0.1:3105/api/app?action=public');
    assert.equal(publicResponse.status, 200);
    assert.ok((await publicResponse.json()).content.some(x => x.id === pub.id));
// Cross-portal connection and privacy flows.
    await req('login', {phone: teacher.phone, password: pass, expected_role: 'parent'}, '', 403);
    await req('register', {
        name: 'New student registration',
        phone: '01000000005',
        password: pass,
        confirm: pass,
        role: 'student',
        birthdate: '2015-01-01',
        guardian_name: 'Parent Test'
    });
    await req('register', {
        name: 'Pending parent registration',
        phone: '01000000006',
        password: pass,
        confirm: pass,
        role: 'parent'
    });
    let connections = await state(admin);
    const newStudent = connections.users.find(x => x.phone === '+201000000005'),
        pendingParent = connections.users.find(x => x.phone === '+201000000006');
    await req('connect_account', {user_id: pendingParent.id, student_ids: ['does-not-exist']}, admin, 404);
    assert.equal((await state(admin)).users.find(x => x.id === pendingParent.id).status, 'pending');
    await req('connect_account', {
        user_id: newStudent.id,
        new_profile: true,
        level: 'أول',
        circle_id: circle.id
    }, admin, 400);
    assert.equal((await state(admin)).users.find(x => x.id === newStudent.id).status, 'pending');
    const nextCircle = await req('circle', {
        name: 'Linked circle',
        level: 'أول',
        type: 'أونلاين',
        schedule: 'الأحد 6 مساء',
        capacity: 5,
        status: 'active',
        teachers: []
    }, admin);
    await req('connect_account', {user_id: teacher.id, circle_ids: [circle.id, nextCircle.id]}, admin);
    await req('connect_account', {
        user_id: newStudent.id,
        new_profile: true,
        level: 'أول',
        circle_id: nextCircle.id
    }, admin);
    connections = await state(admin);
    const newPupil = connections.links.find(l => l.user_id === newStudent.id).student_id;
    await req('connect_account', {user_id: parent.id, student_ids: [pupil.id, newPupil]}, admin);
    await req('connect_account', {user_id: parent.id, student_ids: [unlinked.id]}, parentCookie, 403);
    const parentView = await state(parentCookie);
    assert.equal(parentView.students.length, 2);
    assert.ok(parentView.assignments.some(a => a.user_id === teacher.id && a.circle_id === nextCircle.id));
    assert.equal(parentView.users.find(a => a.id === teacher.id).phone, undefined);
    const newStudentCookie = (await req('login', {
        phone: newStudent.phone,
        password: pass,
        expected_role: 'student'
    })).cookie;
    await req('record', {
        kind: 'memorization',
        student_id: newPupil,
        date: '2026-09-16',
        data: {surah: 'الفلق', from: 1, to: 5, grade: 98}
    }, teacherCookie);
    assert.ok((await state(newStudentCookie)).records.some(r => r.kind === 'memorization' && r.student_id === newPupil));
    assert.ok((await state(parentCookie)).records.some(r => r.kind === 'memorization' && r.student_id === newPupil));
    assert.ok(!(await state(newStudentCookie)).students.some(r => r.id === pupil.id));
    const privateMessage = await req('record', {
        kind: 'message',
        user_id: student.id,
        circle_id: nextCircle.id,
        data: {text: 'Private message for one account'}
    }, admin);
    assert.ok(!(await state(parentCookie)).records.some(r => r.id === privateMessage.id));
    const groupMessage = await req('record', {
        kind: 'message',
        circle_id: nextCircle.id,
        data: {text: 'Linked circle announcement'}
    }, teacherCookie);
    assert.ok((await state(parentCookie)).records.some(r => r.id === groupMessage.id));
    await req('connect_account', {user_id: pendingParent.id, student_ids: [newPupil]}, admin);
    const secondParentCookie = (await req('login', {
        phone: pendingParent.phone,
        password: pass,
        expected_role: 'parent'
    })).cookie;
    assert.equal((await state(secondParentCookie)).students.length, 1);
// Teacher-routed registration review: routing, identity, isolation, and atomic decisions.
    await req('register', {name: 'Other teacher', phone: '01000000020', password: pass, confirm: pass, role: 'sheikh'});
    const otherTeacher = (await state(admin)).users.find(x => x.phone === '+201000000020');
    await req('account', {id: otherTeacher.id, status: 'active'}, admin);
    const otherCookie = (await req('login', {phone: otherTeacher.phone, password: pass})).cookie;
    const payCircle = await req('circle', {
        name: 'Payroll circle',
        level: 'أول',
        type: 'حضوري',
        schedule: 'يوميًا',
        capacity: 20,
        status: 'active',
        teachers: [otherTeacher.id]
    }, admin);
    await req('record', {
        kind: 'salary_config',
        user_id: otherTeacher.id,
        date: '2026-09-01',
        data: {method: 'session', rate: 75}
    }, admin);
    await req('staff_attendance', {mode: 'in', circle_id: circle.id}, otherCookie, 400);
    await req('staff_attendance', {mode: 'in', circle_id: payCircle.id}, otherCookie);
    await req('salary', {user_id: otherTeacher.id, month: '2026-09'}, admin, 400);
    await req('staff_attendance', {mode: 'out', sessions: 20}, otherCookie);
    await req('staff_attendance', {mode: 'in', circle_id: payCircle.id}, otherCookie, 400);
    await req('staff_attendance', {mode: 'absent', circle_id: payCircle.id, date: '2026-09-02'}, otherCookie);
    const pay = await req('salary', {user_id: otherTeacher.id, month: '2026-09'}, admin);
    const payRecord = (await state(admin)).records.find(r => r.id === pay.id);
    assert.equal(payRecord.amount, 7500);
    assert.equal(payRecord.data.sessions, 1);
    assert.equal(payRecord.data.lines.length, 1);
    assert.equal(payRecord.data.lines[0].rate, 7500);
    await req('staff_attendance', {mode: 'in', circle_id: payCircle.id}, otherCookie, 409);
    const opts = await (await mf.dispatchFetch('http://127.0.0.1:3105/api/app?action=signup_options')).json();
    assert.ok(opts.circles.some(c => c.id === nextCircle.id && c.has_teacher));
    assert.ok(!('phone' in opts.circles[0]));
    await req('register', {
        name: 'Invalid branch',
        phone: '01000000021',
        password: pass,
        confirm: pass,
        role: 'student',
        circle_id: nextCircle.id,
        branch: 'Other branch'
    }, '', 400);
    await req('register', {
        name: 'Requested student',
        phone: '01000000022',
        password: pass,
        confirm: pass,
        role: 'student',
        circle_id: nextCircle.id
    });
    let review = (await state(teacherCookie)).requests.find(r => r.phone === '+201000000022');
    assert.ok(review);
    assert.equal((await state(otherCookie)).requests.length, 0);
    assert.equal((await state(parentCookie)).requests.length, 0);
    assert.ok((await state(teacherCookie)).records.some(r => r.kind === 'notification' && r.data.text.includes('طلب تسجيل')));
    await req('review_registration', {
        id: review.id,
        decision: 'approved',
        new_profile: true,
        verified: true
    }, otherCookie, 403);
    await req('review_registration', {
        id: review.id,
        decision: 'approved',
        new_profile: true,
        verified: true
    }, parentCookie, 403);
    await req('review_registration', {id: review.id, decision: 'approved', new_profile: true}, teacherCookie, 400);
    await req('review_registration', {
        id: review.id,
        decision: 'approved',
        student_id: pupil.id,
        verified: true
    }, teacherCookie, 400);
    await req('review_registration', {
        id: review.id,
        decision: 'approved',
        new_profile: true,
        verified: true
    }, teacherCookie);
    const admittedCookie = (await req('login', {phone: '01000000022', password: pass})).cookie;
    const admitted = (await state(admittedCookie)).students[0];
    assert.equal(admitted.circle_id, nextCircle.id);
    await req('review_registration', {id: review.id, decision: 'rejected'}, teacherCookie, 409);
    await req('register', {
        name: 'Requested parent',
        phone: '01000000023',
        password: pass,
        confirm: pass,
        role: 'parent',
        circle_id: nextCircle.id,
        child_name: admitted.name
    });
    const pr = (await state(teacherCookie)).requests.find(r => r.phone === '+201000000023');
    await req('review_registration', {
        id: pr.id,
        decision: 'approved',
        student_id: pupil.id,
        verified: true
    }, teacherCookie, 400);
    await req('review_registration', {
        id: pr.id,
        decision: 'approved',
        student_id: admitted.id,
        verified: true
    }, teacherCookie);
    const admittedParent = (await req('login', {phone: '01000000023', password: pass})).cookie;
    assert.equal((await state(admittedParent)).students[0].id, admitted.id);
    await req('register', {
        name: 'Rejected applicant',
        phone: '01000000024',
        password: pass,
        confirm: pass,
        role: 'student',
        circle_id: nextCircle.id
    });
    const rejected = (await state(teacherCookie)).requests.find(r => r.phone === '+201000000024');
    await req('review_registration', {
        id: rejected.id,
        decision: 'rejected',
        reason: 'لم تتطابق البيانات'
    }, teacherCookie);
    await req('login', {phone: '01000000024', password: pass}, '', 403);
    await assert.rejects(() => db.prepare("UPDATE records SET status='approved' WHERE id=?").bind(rejected.id).run());
// Full circle must roll back the request decision as well as account/link writes.
    await req('register', {
        name: 'Capacity applicant',
        phone: '01000000025',
        password: pass,
        confirm: pass,
        role: 'student',
        circle_id: circle.id
    });
    const full = (await state(teacherCookie)).requests.find(r => r.phone === '+201000000025');
    await req('review_registration', {
        id: full.id,
        decision: 'approved',
        new_profile: true,
        verified: true
    }, teacherCookie, 409);
    assert.equal((await state(teacherCookie)).requests.find(r => r.id === full.id).status, 'pending');
    for (const route of ['portals', 'admin', 'sheikh', 'assistant', 'student', 'parent']) {
        const response = await mf.dispatchFetch('http://127.0.0.1:3105/' + route);
        assert.equal(response.status, 200);
        assert.ok((await response.text()).includes('دار الطفل المسلم'));
        checks++;
    }
    const backupRes = await mf.dispatchFetch('http://127.0.0.1:3105/api/app?action=backup', {headers: {cookie: admin}});
    assert.equal(backupRes.status, 200);
    const backup = await backupRes.json();
    assert.ok(backup.audit.length > 10);
    await req('restore', {snapshot: backup}, admin);
    const forbiddenBackup = await mf.dispatchFetch('http://127.0.0.1:3105/api/app?action=backup', {headers: {cookie: parentCookie}});
    assert.equal(forbiddenBackup.status, 403);
    await assert.rejects(() => db.prepare('DELETE FROM audit').run());
    await assert.rejects(() => db.prepare("UPDATE records SET amount=1 WHERE id=?").bind(salary.id).run());
    const loginAgain = await req('login', {phone: parent.phone, password: pass});
    assert.ok((await state(loginAgain.cookie)).records.some(r => r.id === sub.id));
    const home = await mf.dispatchFetch('http://127.0.0.1:3105/');
    assert.equal(home.status, 200);
    assert.ok((await home.text()).includes('دار الطفل المسلم'));

// Phone proof and private portraits: isolated database fixtures, no real SMS.
    await db.prepare('DELETE FROM attempts').run();
    await req('phone_send', {phone: '01000000001'}, '', 503);
    await req('register', {
        name: 'Duplicate account',
        phone: '01000000001',
        username: 'another.teacher',
        password: pass,
        confirm: pass,
        role: 'sheikh'
    }, '', 409);
    await req('register', {
        name: 'Invalid portrait',
        phone: '01000000901',
        password: pass,
        confirm: pass,
        role: 'sheikh',
        photo: 'data:image/svg+xml;base64,PHN2Zz4='
    }, '', 400);
    const proof = 'fixture-one-time-proof';
    const proofHash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(proof))).toString('hex');
    await db.prepare('INSERT INTO phone_tokens VALUES(?,?,?,?)').bind(proofHash, teacher.phone, Date.now() + 600000, 'verified-shared-fixture').run();
    await req('register', {
        name: 'Verified shared teacher',
        phone: teacher.phone,
        username: 'shared.teacher',
        password: pass,
        confirm: pass,
        role: 'sheikh',
        phone_token: proof
    });
    await req('account', {id: 'verified-shared-fixture', status: 'active'}, admin);
    const sharedLogin = await req('login', {phone: 'shared.teacher', password: pass});
    assert.equal((await state(sharedLogin.cookie)).user.id, 'verified-shared-fixture');
    await req('login', {phone: teacher.phone, password: pass}, '', 409);
    await req('register', {
        name: 'Reused verification',
        phone: teacher.phone,
        username: 'reused.teacher',
        password: pass,
        confirm: pass,
        role: 'sheikh',
        phone_token: proof
    }, '', 409);
    assert.equal(await db.prepare('SELECT id FROM phone_tokens WHERE id=?').bind(proofHash).first(), null);
    for (const [cookie, status] of [[teacherCookie, 200], [admin, 200], [loginAgain.cookie, 403], ['', 401]]) {
        const r = await mf.dispatchFetch('http://127.0.0.1:3105/api/app?action=avatar&id=' + teacher.id, {headers: {cookie}});
        assert.equal(r.status, status);
        checks++;
    }

    console.log(JSON.stringify({
        passed: true,
        checks,
        flows: ['registration approval linking', 'student isolation and sheikh scope', 'attendance memorization revision plan', 'payment balance and restricted access recovery', 'expense approval payroll lock', 'capacity waitlist transfer', 'backup restore audit immutability', 'session persistence and SSR']
    }));
} finally {
}
