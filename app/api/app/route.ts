import {clientIp, cookieSecurity, requestOrigin} from '@/runtime/config.mjs';
import {checkPhoneCode, normalizePhone, otpChannel, otpConfigured, sendPhoneCode} from '@/lib/phone-verification';
import {planTypes, ratings, revisionTypes} from '@/lib/learning';
import {all, auditStmt, bucket, database, now, one, parse, recordStmt, statement, uid} from '@/db/store';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';
const roles = ['admin', 'sheikh', 'assistant', 'student', 'parent'];
const isStaff = (u: any) => ['sheikh', 'assistant'].includes(u.role);

class AppError extends Error {
    constructor(message: string, public status = 400) {
        super(message);
    }
}

const need = (ok: any, msg = 'البيانات غير صحيحة', status = 400) => {
    if (!ok) throw new AppError(msg, status);
};
const str = (v: any, max = 3000) => String(v ?? '').trim().slice(0, max);
const pick = (v: any, values: string[]) => {
    need(values.includes(v));
    return v;
};
const enc = new TextEncoder();

async function digest(s: string) {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))).map(x => x.toString(16).padStart(2, '0')).join('');
}

async function hash(password: string, salt = uid()) {
    const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({
        name: 'PBKDF2',
        salt: enc.encode(salt),
        iterations: 100000,
        hash: 'SHA-256'
    }, key, 256);
    return salt + ':' + Array.from(new Uint8Array(bits)).map(x => x.toString(16).padStart(2, '0')).join('');
}

function safe(u: any) {
    if (!u) return null;
    const {password, platform_id, ...rest} = u;
    return parse(rest);
}

async function actor(req: Request, required = true) {
    const token = req.headers.get('cookie')?.match(/(?:^|;\s*)dar_session=([^;]+)/)?.[1];
    const u = token ? await one('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.id=? AND s.expires>?', await digest(token), Date.now()) : null;
    if (required) need(u && u.status === 'active', 'سجل الدخول بحساب نشط أولًا', 401);
    return u?.status === 'active' ? u : null;
}

async function accessible(u: any) {
    if (u.role === 'admin') return all("SELECT * FROM students");
    if (isStaff(u)) return all("SELECT s.* FROM students s JOIN assignments a ON a.circle_id=s.circle_id WHERE a.user_id=? AND s.status!='archived'", u.id);
    return all("SELECT s.* FROM students s JOIN links l ON l.student_id=s.id WHERE l.user_id=? AND s.status!='archived'", u.id);
}

async function studentAccess(u: any, id: any) {
    const s = await one('SELECT * FROM students WHERE id=?', id);
    need(s, 'الطالب غير موجود', 404);
    need(u.role === 'admin' || (await accessible(u)).some(x => x.id === id), 'غير مسموح بالوصول لهذا الطالب', 403);
    return s;
}

const admin = (u: any) => need(u.role === 'admin', 'هذه العملية للإدارة فقط', 403);

async function circleAccess(u: any, id: string) {
    need(await one('SELECT id FROM circles WHERE id=?', id), 'الحلقة غير موجودة');
    need(u.role === 'admin' || await one('SELECT id FROM assignments WHERE circle_id=? AND user_id=?', id, u.id), 'هذه الحلقة ليست ضمن حلقاتك', 403);
}

const money = (v: any) => {
    const n = Number(v);
    need(Number.isFinite(n) && n >= 0 && n <= 100000000, 'المبلغ غير صحيح');
    return Math.round(n * 100);
};
const date = (v: any) => {
    const s = str(v, 10);
    need(/^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)), 'حدد تاريخًا صحيحًا');
    return s;
};

function learningData(kind: string, v: any, day: string) {
    const value: any = {notes: str(v.notes, 1000)};
    const percentage = (input: any, required = false) => {
        need(!required || (input !== '' && input !== undefined && input !== null), 'اكتب النسبة المئوية');
        if (input === '' || input === undefined || input === null) return undefined;
        const n = Number(input);
        need(Number.isFinite(n) && n >= 0 && n <= 100, 'النسبة المئوية من 0 إلى 100');
        return n;
    };
    if (kind === 'assessment') {
        value.from_surah = str(v.from_surah, 120);
        value.to_surah = str(v.to_surah, 120);
        need(value.from_surah && value.to_surah, 'حدد بداية الاختبار ونهايته');
        value.title = 'اختبار من ' + value.from_surah + ' إلى ' + value.to_surah;
        value.score = percentage(v.score, true);
        return value;
    }
    const from = Number(v.from), to = Number(v.to);
    need(str(v.surah) && Number.isInteger(from) && Number.isInteger(to) && from >= 1 && to >= from && to <= 286, 'راجع السورة والآيات');
    Object.assign(value, {surah: str(v.surah, 120), from, to});
    if (kind === 'plan') {
        value.plan_type = pick(v.plan_type, planTypes);
        value.due = date(v.due);
        need(value.due >= day, 'موعد المطلوب لا يسبق الحلقة');
    } else {
        value.rating = pick(v.rating, ratings);
        if (kind === 'revision') {
            value.revision_type = pick(v.revision_type, revisionTypes);
            const p = percentage(v.percentage);
            if (p !== undefined) value.percentage = p;
        }
    }
    return value;
}

async function notifyStudent(actorId: string, sid: string, text: string) {
    const linked = await all("SELECT user_id FROM links WHERE student_id=?", sid);
    return linked.map(l => recordStmt(actorId, 'notification', {
        student_id: sid,
        user_id: l.user_id,
        data: {text},
        status: 'unread'
    }));
}

async function loginResponse(u: any) {
    const token = uid() + uid();
    await database().batch([statement('INSERT INTO sessions VALUES(?,?,?)', await digest(token), u.id, Date.now() + 7 * 86400000)]);
    return Response.json({
        ok: true,
        user: safe(u)
    }, {
        headers: {
            'Set-Cookie': `dar_session=${token}; HttpOnly; ${cookieSecurity()}SameSite=Lax; Path=/; Max-Age=604800`,
            'Cache-Control': 'no-store'
        }
    });
}

async function throttle(key: string, limit: number, windowMs: number) {
    const id = await digest('limit:' + key);
    const n = Date.now();
    const row = await statement('INSERT INTO attempts VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END RETURNING count', id, n + windowMs, n, n).first() as any;
    need(row.count <= limit, 'محاولات كثيرة؛ انتظر قليلًا قبل إعادة المحاولة', 429);
}

function portrait(input: any) {
    need(typeof input === 'string' && input.length < 2900000, 'ارفع صورة شخصية بحد أقصى 2 ميجابايت');
    const match = input.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
    need(match, 'الصورة غير صالحة');
    let bytes: Uint8Array;
    try {
        bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0));
    } catch {
        throw new AppError('الصورة غير صالحة');
    }
    need(bytes!.length > 12 && bytes!.length <= 2 * 1024 * 1024, 'حجم الصورة غير مناسب');
    const b = bytes!;
    const png = b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71;
    const jpeg = b[0] === 255 && b[1] === 216 && b[2] === 255;
    const webp = new TextDecoder().decode(b.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(b.slice(8, 12)) === 'WEBP';
    need(match[1] === 'image/png' ? png : match[1] === 'image/jpeg' ? jpeg : webp, 'محتوى الصورة لا يطابق نوعها');
    return {bytes: b, type: match[1]};
}

async function get(req: Request) {
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'state';
    if (action === 'signup_options') return {
        phone_verification: otpConfigured(),
        otp_channel: otpChannel(),
        circles: await all("SELECT c.id,c.name,COALESCE(NULLIF(trim(json_extract(c.details,'$.branch')),''),'الفرع الرئيسي') branch,EXISTS(SELECT 1 FROM assignments a JOIN users u ON u.id=a.user_id WHERE a.circle_id=c.id AND u.role='sheikh' AND u.status='active') has_teacher FROM circles c WHERE c.status='active' ORDER BY branch,c.name")
    };
    if (action === 'public') {
        return {
            circles: (await all("SELECT id,name,level,type,schedule,capacity FROM circles WHERE status='active'")),
            content: (await all("SELECT r.* FROM records r LEFT JOIN students s ON s.id=r.student_id WHERE r.kind='content' AND r.status='published' AND (r.student_id IS NULL OR json_extract(s.details,'$.consent')=1) ORDER BY r.date DESC")).map(parse),
            stats: await one("SELECT (SELECT count(*) FROM students WHERE status='active') students,(SELECT count(*) FROM circles WHERE status='active') circles,(SELECT count(*) FROM users WHERE role='sheikh' AND status='active') sheikhs")
        };
    }
    if (action === 'media') {
        const f = await one("SELECT f.* FROM files f JOIN records r ON json_extract(r.data,'$.receipt')=f.id LEFT JOIN students s ON s.id=r.student_id WHERE f.id=? AND r.kind='content' AND r.status='published' AND (r.student_id IS NULL OR json_extract(s.details,'$.consent')=1)", url.searchParams.get('id'));
        need(f, 'الصورة غير متاحة', 404);
        const file = await bucket().get(f.id);
        need(file, 'الصورة غير موجودة', 404);
        return new Response(file!.body, {
            headers: {
                'Content-Type': f.type,
                'Cache-Control': 'no-store',
                'X-Content-Type-Options': 'nosniff'
            }
        });
    }
    const u = await actor(req, false);
    if (action === 'state' && !u) return {
        user: null,
        setup: !(await one("SELECT id FROM users WHERE role='admin'")),
        canSetup: false
    };
    need(u, 'سجل الدخول أولًا', 401);
    if (action === 'avatar') {
        const target = await one('SELECT * FROM users WHERE id=?', url.searchParams.get('id'));
        need(target, 'الصورة غير متاحة', 404);
        const allowed = u.role === 'admin' || u.id === target.id || (u.role === 'sheikh' && ['student', 'parent'].includes(target.role) && await one("SELECT r.id FROM records r JOIN assignments a ON a.circle_id=r.circle_id WHERE r.kind='registration' AND r.user_id=? AND a.user_id=?", target.id, u.id));
        need(allowed, 'الصورة غير متاحة', 403);
        const id = JSON.parse(target.details).photo_id;
        need(id, 'لم تُضف صورة', 404);
        const file = await bucket().get(id);
        need(file, 'الصورة غير متاحة', 404);
        return new Response(file!.body, {
            headers: {
                'Content-Type': file!.httpMetadata?.contentType || 'image/jpeg',
                'Cache-Control': 'private, no-store',
                'X-Content-Type-Options': 'nosniff'
            }
        });
    }
    if (action === 'file') {
        const f = await one('SELECT * FROM files WHERE id=?', url.searchParams.get('id'));
        need(f && (u.role === 'admin' || f.owner_id === u.id), 'غير مسموح', 403);
        const b = await bucket().get(f.id);
        need(b, 'الملف غير موجود', 404);
        return new Response(b!.body, {
            headers: {
                'Content-Type': f.type,
                'Content-Disposition': `inline; filename="receipt"`,
                'Cache-Control': 'private, no-store',
                'X-Content-Type-Options': 'nosniff'
            }
        });
    }
    if (action === 'backup') {
        admin(u);
        const tables = ['users', 'circles', 'assignments', 'students', 'links', 'records', 'audit', 'files', 'settings'];
        const data: any = {version: 1, created: now()};
        for (const t of tables) data[t] = await all(`SELECT * FROM ${t}`);
        await database().batch([auditStmt(u.id, 'backup', 'system', null, {created: data.created})]);
        return data;
    }
    const ss = (await accessible(u)).map(parse);
    const cs = u.role === 'admin' ? await all("SELECT * FROM circles WHERE status!='archived'") : isStaff(u) ? await all('SELECT c.* FROM circles c JOIN assignments a ON a.circle_id=c.id WHERE a.user_id=?', u.id) : await all('SELECT DISTINCT c.* FROM circles c JOIN students s ON s.circle_id=c.id JOIN links l ON l.student_id=s.id WHERE l.user_id=?', u.id);
    let rec: any[];
    if (u.role === 'admin') rec = await all('SELECT * FROM records ORDER BY created DESC');
    else {
        const ids = ss.map(s => s.id);
        const placeholders = ids.map(() => '?').join(',') || 'NULL';
        rec = await all(`SELECT * FROM records WHERE (student_id IN (${placeholders}) AND kind IN ('attendance','memorization','revision','assessment','plan','subscription','payment','note','transfer','task','waitlist')) OR (user_id=? AND kind IN ('notification','expense','staff_attendance','salary','salary_config')) OR (kind='message' AND (user_id=? OR actor_id=? OR (user_id IS NULL AND (circle_id IS NULL OR circle_id IN (SELECT circle_id FROM assignments WHERE user_id=?))) OR (user_id IS NULL AND circle_id IN (SELECT s.circle_id FROM students s JOIN links l ON l.student_id=s.id WHERE l.user_id=?)))) ORDER BY created DESC`, ...ids, u.id, u.id, u.id, u.id, u.id);
    }
    const general = JSON.parse((await one("SELECT value FROM settings WHERE id='general'"))?.value || '{}');
    const restrictions: any[] = [];
    if (['student', 'parent'].includes(u.role)) {
        for (const r of rec.filter(x => x.kind === 'subscription' && x.status !== 'void')) {
            const paid = rec.filter(x => x.kind === 'payment' && x.parent_id === r.id && x.status !== 'void').reduce((n, x) => n + x.amount, 0);
            const due = JSON.parse(r.data).due;
            if (paid < r.amount && Date.now() - Date.parse(due) > (Number(general.overdue_days) || 0) * 86400000) restrictions.push({
                student_id: r.student_id,
                amount: r.amount - paid,
                restricted: !!general.restrict_access
            });
        }
        if (general.restrict_access) {
            const ids = restrictions.map(x => x.student_id);
            rec = rec.filter(x => !ids.includes(x.student_id) || !['plan', 'memorization', 'revision', 'assessment'].includes(x.kind));
        }
    }
    if (isStaff(u)) rec = rec.filter(x => !['payment', 'subscription'].includes(x.kind));
    const circleIds = cs.map(c => c.id);
    const relevantAssignments = u.role === 'admin' ? await all('SELECT * FROM assignments') : circleIds.length ? await all(`SELECT * FROM assignments WHERE circle_id IN (${circleIds.map(() => '?').join(',')})`, ...circleIds) : [];
    const visibleIds = [...new Set([u.id, ...relevantAssignments.map(a => a.user_id), ...rec.map(r => r.actor_id)])];
    const directory = u.role === 'admin' ? (await all('SELECT * FROM users ORDER BY created DESC')).map(safe) : [safe(u), ...(await all(`SELECT id,name,role FROM users WHERE id IN (${visibleIds.map(() => '?').join(',')}) AND id!=?`, ...visibleIds, u.id)).map(x => ({
        ...x,
        details: {}
    }))];
    const requests = ['admin', 'sheikh'].includes(u.role) ? (await all(`SELECT r.*,t.name,t.phone,t.role,t.status account_status,json_extract(t.details,'$.photo_id') photo_id FROM records r JOIN users t ON t.id=r.user_id WHERE r.kind='registration' ${u.role === 'admin' ? '' : "AND t.role IN ('student','parent') AND r.circle_id IN (SELECT circle_id FROM assignments WHERE user_id=?)"} ORDER BY r.created DESC`, ...(u.role === 'admin' ? [] : [u.id]))).map(parse) : [];
    return {
        requests,
        restrictions,
        user: safe(u),
        students: ss,
        circles: cs.map(parse),
        records: rec.map(parse),
        users: directory,
        assignments: relevantAssignments,
        links: u.role === 'admin' ? await all('SELECT * FROM links') : await all('SELECT * FROM links WHERE user_id=?', u.id),
        audit: u.role === 'admin' ? await all('SELECT a.*,u.name actor FROM audit a JOIN users u ON u.id=a.actor_id ORDER BY a.created DESC LIMIT 1000') : [],
        settings: (await one("SELECT value FROM settings WHERE id='general'"))?.value || '{}'
    };
}

async function post(req: Request) {
    need(req.headers.get('origin') === requestOrigin(), 'طلب غير مسموح', 403);
    need(Number(req.headers.get('content-length') || 0) < 9000000, 'الملف كبير جدًا');
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
        const u = await actor(req);
        const fd = await req.formData();
        const f = fd.get('file') as File;
        need(f && f.size > 0 && f.size <= 5 * 1024 * 1024 && ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(f.type), 'ارفع صورة أو PDF بحد أقصى 5 ميجابايت');
        const id = uid();
        await bucket().put(id, f.stream(), {httpMetadata: {contentType: f.type}});
        await database().batch([statement('INSERT INTO files VALUES(?,?,?,?,?)', id, u.id, str(f.name, 150), f.type, now())]);
        return {id};
    }
    const b: any = await req.json();
    const action = b.action;
    const d = b.data || {};
    need(action !== 'setup', 'إنشاء الإدارة يتم من لوحة أوامر السيرفر فقط', 403);
    if (['phone_send', 'phone_check'].includes(action)) {
        need(otpConfigured(), 'خدمة تأكيد الهاتف لم تُفعّل بعد؛ تواصل مع الإدارة', 503);
        const phone = normalizePhone(str(d.phone, 30));
        need(/^\+[1-9][0-9]{7,14}$/.test(phone), 'اكتب الهاتف مع كود الدولة');
        const ip = clientIp(req);
        await throttle('otp-ip:' + ip, action === 'phone_send' ? 10 : 30, 3600000);
        await database().batch([statement('DELETE FROM phone_tokens WHERE expires<?', Date.now())]);
        if (action === 'phone_send') {
            await throttle('otp-minute:' + phone, 1, 60000);
            await throttle('otp-hour:' + phone, 4, 3600000);
            await throttle('otp-total', 200, 86400000);
            try {
                await sendPhoneCode(phone);
            } catch {
                throw new AppError('تعذر إرسال الكود؛ راجع الرقم أو حاول لاحقًا', 502);
            }
            return {ok: true, message: 'تم إرسال كود التأكيد', retry_after: 60};
        }
        await throttle('otp-check:' + phone, 5, 900000);
        need(/^[0-9]{4,10}$/.test(str(d.code)), 'اكتب كود التأكيد الصحيح');
        let approved = false;
        try {
            approved = await checkPhoneCode(phone, str(d.code));
        } catch {
        }
        need(approved, 'الكود غير صحيح أو انتهت صلاحيته');
        const token = uid() + uid();
        await database().batch([statement('INSERT INTO phone_tokens VALUES(?,?,?,?)', await digest(token), phone, Date.now() + 600000, uid())]);
        return {ok: true, token};
    }
    if (['login', 'register', 'setup'].includes(action)) {
        const identifier = str(d.phone, 80).toLowerCase();
        const byUsername = action === 'login' && /^[a-z][a-z0-9_.-]{3,31}$/.test(identifier);
        const phone = byUsername ? identifier : normalizePhone(identifier);
        need(byUsername || /^\+?[0-9]{8,15}$/.test(phone), 'اكتب اسم المستخدم أو رقم هاتف صحيحًا');
        const password = str(d.password, 200);
        need(password.length >= 8, 'كلمة المرور لا تقل عن 8 أحرف');
        const key = await digest(phone + ':' + (clientIp(req)));
        const attempt = await one('SELECT * FROM attempts WHERE id=?', key);
        need(!attempt || attempt.expires < Date.now() || attempt.count < 5, 'محاولات كثيرة؛ حاول بعد 15 دقيقة', 429);
        await database().batch([statement('INSERT INTO attempts VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END', key, Date.now() + 900000, Date.now(), Date.now())]);
        if (action === 'login') {
            const candidates = byUsername ? await all("SELECT * FROM users WHERE lower(json_extract(details,'$.username'))=?", identifier) : await all('SELECT * FROM users WHERE phone=? LIMIT 11', phone);
            const matches = [];
            for (const candidate of candidates) {
                if (await hash(password, candidate.password.split(':')[0]) === candidate.password) matches.push(candidate);
            }
            need(matches.length, 'بيانات الدخول غير صحيحة', 401);
            const matching = d.expected_role ? matches.filter(x => x.role === pick(d.expected_role, roles)) : matches;
            need(matching.length, 'هذا الحساب تابع لبوابة أخرى؛ اختر بوابة حسابك', 403);
            need(matching.length === 1, 'يوجد أكثر من حساب بنفس البيانات؛ استخدم اسم المستخدم الخاص بحسابك', 409);
            const u = matching[0];
            need(u.status === 'active', u.status === 'pending' ? 'حسابك قيد المراجعة؛ انتظر موافقة المسؤول' : 'الحساب غير نشط؛ تواصل مع الإدارة', 403);
            return loginResponse(u);
        }
        need(str(d.name).length >= 3, 'اكتب الاسم كاملًا');
        need(d.password === d.confirm, 'كلمتا المرور غير متطابقتين');
        let role = pick(d.role, ['student', 'parent', 'sheikh', 'assistant']);
        if (action === 'setup') {
            need(!await one("SELECT id FROM users WHERE role='admin'"), 'تم إعداد الإدارة بالفعل', 403);
            role = 'admin';
        }
        let registrationCircle: any = null;
        if (action === 'register' && ['student', 'parent', 'assistant'].includes(role)) {
            registrationCircle = await one("SELECT * FROM circles WHERE id=? AND status='active'", str(d.circle_id));
            need(registrationCircle, 'اختر فرعًا وحلقة نشطة');
            need(str(d.branch) === (str(JSON.parse(registrationCircle.details).branch) || 'الفرع الرئيسي'), 'الحلقة لا تتبع الفرع المحدد');
            if (role === 'parent') need(str(d.child_name).length >= 3, 'اكتب اسم الابن كاملًا');
        }
        const username = str(d.username, 32).toLowerCase();
        if (action === 'register') {
            need(/^[a-z][a-z0-9_.-]{3,31}$/.test(username), 'اسم المستخدم: 4 إلى 32 حرفًا إنجليزيًا أو رقمًا، ويبدأ بحرف');
            need(!await one("SELECT id FROM users WHERE lower(json_extract(details,'$.username'))=?", username), 'اسم المستخدم مستخدم بالفعل');
        }
        const proof = action === 'register' && d.phone_token ? await one('SELECT * FROM phone_tokens WHERE id=? AND phone=? AND expires>?', await digest(str(d.phone_token, 100)), phone, Date.now()) : null;
        if (action === 'register' && otpConfigured()) need(proof, 'أكد رقم الهاتف بالكود أولًا');
        const shared = await one('SELECT COUNT(*) n FROM users WHERE phone=?', phone);
        need(shared.n < 10, 'وصل الرقم للحد الأقصى للحسابات');
        if (shared.n) need(proof, 'تسجيل أكثر من حساب بنفس الرقم يحتاج تفعيل خدمة تأكيد الهاتف', 409);
        const photo = action === 'register' ? portrait(d.photo) : null;
        const photoId = photo ? uid() : null;
        const id = action === 'setup' ? 'academy-owner' : proof?.account_id || uid();
        const u = {
            id,
            name: str(d.name, 120),
            phone,
            password: await hash(password),
            role,
            status: action === 'setup' ? 'active' : 'pending',
            platform_id: null,
            details: JSON.stringify({
                ...(username ? {username} : {}),
                photo_id: photoId,
                phone_verified: !!proof,
                verification: str(d.verification),
                birthdate: str(d.birthdate),
                guardian_name: str(d.guardian_name),
                guardian_phone: str(d.guardian_phone),
                address: str(d.address)
            }),
            created: now()
        };
        const ops = [statement('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?)', ...Object.values(u)), auditStmt(id, 'register', id, null, {
            name: u.name,
            role,
            status: u.status
        })];
        if (photo) ops.push(statement('INSERT INTO files VALUES(?,?,?,?,?)', photoId, id, 'صورة شخصية', photo.type, now()));
        if (proof) ops.push(statement('DELETE FROM phone_tokens WHERE id=?', proof.id));
        let assigned: any[] = [];
        if (registrationCircle) {
            assigned = role === 'assistant' ? [] : await all("SELECT u.id FROM users u JOIN assignments a ON a.user_id=u.id WHERE a.circle_id=? AND u.status='active' AND u.role='sheikh'", registrationCircle.id);
            ops.push(recordStmt(id, 'registration', {
                user_id: id,
                circle_id: registrationCircle.id,
                status: 'pending',
                data: {
                    branch: str(d.branch),
                    child_name: role === 'parent' ? str(d.child_name, 120) : u.name,
                    verification: str(d.verification)
                }
            }));
            const reviewers = assigned.length ? assigned : await all("SELECT id FROM users WHERE role='admin' AND status='active'");
            for (const reviewer of reviewers) ops.push(recordStmt(id, 'notification', {
                user_id: reviewer.id,
                status: 'unread',
                data: {text: 'طلب تسجيل جديد في ' + registrationCircle.name + '؛ راجع قسم طلبات التسجيل.'}
            }));
        }
        if (photo) await bucket().put(photoId!, photo.bytes, {httpMetadata: {contentType: photo.type}});
        try {
            await database().batch(ops);
        } catch (e) {
            if (photo) await bucket().delete(photoId!);
            throw e;
        }
        return action === 'setup' ? loginResponse(u) : {
            ok: true,
            username,
            message: assigned.length ? 'تم إرسال طلبك إلى شيخ الحلقة. يمكنك الدخول بعد موافقته.' : 'تم إرسال طلبك للإدارة للمراجعة. يمكنك الدخول بعد الموافقة.'
        };
    }
    const u = await actor(req);
    if (action === 'logout') {
        const token = req.headers.get('cookie')?.match(/dar_session=([^;]+)/)?.[1];
        if (token) await database().batch([statement('DELETE FROM sessions WHERE id=?', await digest(token))]);
        return Response.json({ok: true}, {headers: {'Set-Cookie': `dar_session=; HttpOnly; ${cookieSecurity()}SameSite=Lax; Path=/; Max-Age=0`}});
    }
    if (action === 'account') {
        admin(u);
        const old = await one('SELECT * FROM users WHERE id=?', d.id);
        need(old, 'الحساب غير موجود');
        need(old.id !== u.id, 'لا يمكنك تغيير حالة حسابك');
        const status = pick(d.status, ['active', 'rejected', 'suspended', 'pending']);
        await database().batch([statement('UPDATE users SET status=? WHERE id=?', status, old.id), auditStmt(u.id, 'account_status', old.id, {status: old.status}, {status})]);
        return {ok: true};
    }
    if (action === 'password') {
        need(str(d.password).length >= 8 && d.password === d.confirm, 'راجع كلمة المرور وتأكيدها');
        const id = d.user_id || u.id;
        if (id !== u.id) admin(u); else need(await hash(str(d.current), u.password.split(':')[0]) === u.password, 'كلمة المرور الحالية غير صحيحة');
        await database().batch([statement('UPDATE users SET password=? WHERE id=?', await hash(d.password), id), statement('DELETE FROM sessions WHERE user_id=?', id), auditStmt(u.id, 'password_reset', id, null, {reset: true})]);
        return {ok: true};
    }
    if (action === 'connect_account') {
        admin(u);
        const target = await one('SELECT * FROM users WHERE id=?', d.user_id);
        need(target && target.role !== 'admin', 'اختر حساب شيخ أو طالب أو ولي أمر');
        const ops: any[] = [];
        let scope: any = {};
        if (isStaff(target)) {
            const ids = Array.isArray(d.circle_ids) ? [...new Set(d.circle_ids)] : [];
            need(ids.length > 0 && ids.length <= 100, 'حدد حلقة واحدة على الأقل');
            for (const id of ids) need(await one("SELECT id FROM circles WHERE id=? AND status!='archived'", id), 'إحدى الحلقات غير متاحة');
            const old = await all('SELECT circle_id FROM assignments WHERE user_id=?', target.id);
            scope = {before: old.map(x => x.circle_id), circle_ids: ids};
            ops.push(statement('DELETE FROM assignments WHERE user_id=?', target.id), ...ids.map(id => statement('INSERT INTO assignments VALUES(?,?,?)', uid(), id, target.id)));
        } else {
            let ids: any[] = [];
            if (target.role === 'student' && d.new_profile) {
                need(!await one('SELECT id FROM links WHERE user_id=?', target.id), 'الحساب مرتبط بملف بالفعل؛ اختر الملف الموجود');
                need(str(d.level), 'حدد مستوى الطالب');
                const c = await one("SELECT * FROM circles WHERE id=? AND status='active'", d.circle_id);
                need(c, 'حدد حلقة نشطة');
                const count = await one("SELECT COUNT(*) n FROM students WHERE circle_id=? AND status='active'", c.id);
                need(count.n < c.capacity, 'الحلقة مكتملة؛ اختر حلقة أخرى');
                const sid = uid();
                const detail = JSON.parse(target.details);
                const details = {
                    birthdate: detail.birthdate || '',
                    guardian_name: detail.guardian_name || '',
                    guardian_phone: detail.guardian_phone || '',
                    address: detail.address || '',
                    enrollment_date: now().slice(0, 10),
                    consent: false
                };
                ops.push(statement('INSERT INTO students VALUES(?,?,?,?,?,?,?,?)', sid, target.name, target.phone, c.id, str(d.level, 120), 'active', JSON.stringify(details), now()), auditStmt(u.id, 'student', sid, null, {
                    name: target.name,
                    circle_id: c.id,
                    from_registration: target.id
                }));
                ids = [sid];
            } else {
                ids = target.role === 'student' ? [d.student_id] : Array.isArray(d.student_ids) ? [...new Set(d.student_ids)] : [];
                need(ids.length > 0 && ids.length <= 100 && ids.every(Boolean), 'حدد ملف الطالب أو ملفات الأبناء');
                for (const id of ids) await studentAccess(u, id);
            }
            const old = await all('SELECT student_id FROM links WHERE user_id=?', target.id);
            scope = {before: old.map(x => x.student_id), student_ids: ids};
            ops.push(statement('DELETE FROM links WHERE user_id=?', target.id), ...ids.map(id => statement('INSERT INTO links VALUES(?,?,?)', uid(), target.id, id)));
        }
        ops.push(statement("UPDATE users SET status='active' WHERE id=?", target.id), auditStmt(u.id, 'connect_account', target.id, {
            status: target.status,
            scope: scope.before
        }, {status: 'active', ...scope}), recordStmt(u.id, 'notification', {
            user_id: target.id,
            status: 'unread',
            data: {text: 'تم تفعيل حسابك وربط بياناتك. افتح بوابتك لمتابعة الحلقات والسجلات.'}
        }));
        await database().batch(ops);
        return {ok: true};
    }
    if (action === 'review_registration') {
        need(['admin', 'sheikh'].includes(u.role), 'غير مسموح', 403);
        const r = await one("SELECT * FROM records WHERE id=? AND kind='registration'", d.id);
        need(r, 'الطلب غير موجود', 404);
        await circleAccess(u, r.circle_id);
        need(r.status === 'pending', 'تمت مراجعة الطلب بالفعل', 409);
        const target = await one('SELECT * FROM users WHERE id=?', r.user_id);
        need(target && ['student', 'parent', 'assistant'].includes(target.role) && target.status === 'pending', 'تغيرت حالة الحساب؛ حدّث الصفحة', 409);
        if (target.role === 'assistant') admin(u);
        const decision = pick(d.decision, ['approved', 'rejected']);
        const detail = JSON.parse(r.data);
        const ops: any[] = [];
        let sid: string | null = null;
        if (decision === 'approved') {
            const c = await one("SELECT * FROM circles WHERE id=? AND status='active'", r.circle_id);
            need(c, 'الحلقة غير نشطة');
            need(d.verified === true, 'أكد التحقق من هوية صاحب الطلب وعلاقته بالطالب');
            if (target.role === 'assistant') {
                ops.push(statement('INSERT INTO assignments VALUES(?,?,?)', uid(), r.circle_id, target.id));
            } else {
                if (d.new_profile) {
                    need(target.role === 'student', 'ولي الأمر يجب ربطه بملف ابنه الموجود');
                    sid = uid();
                    const td = JSON.parse(target.details);
                    ops.push(statement('INSERT INTO students VALUES(?,?,?,?,?,?,?,?)', sid, target.name, target.phone, c.id, c.level, 'active', JSON.stringify({
                        ...td,
                        consent: false,
                        enrollment_date: now().slice(0, 10)
                    }), now()), auditStmt(u.id, 'student', sid, null, {
                        name: target.name,
                        circle_id: c.id,
                        from_registration: target.id
                    }));
                } else {
                    const st = await one("SELECT * FROM students WHERE id=? AND circle_id=? AND status='active'", str(d.student_id), c.id);
                    need(st, 'اختر ملف طالب نشط من نفس الحلقة');
                    sid = st.id;
                }
                need(!await one('SELECT id FROM links WHERE user_id=?', target.id), 'الحساب مرتبط بالفعل؛ راجع الإدارة', 409);
                ops.push(statement('INSERT INTO links VALUES(?,?,?)', uid(), target.id, sid));
            }
        }
        const result = {...detail, reviewer_id: u.id, reviewed: now(), reason: str(d.reason), student_id: sid};
        ops.unshift(statement('UPDATE records SET status=?,data=? WHERE id=?', decision, JSON.stringify(result), r.id));
        ops.push(statement('UPDATE users SET status=? WHERE id=?', decision === 'approved' ? 'active' : 'rejected', target.id), auditStmt(u.id, 'review_registration', r.id, {status: r.status}, {
            ...result,
            status: decision
        }), recordStmt(u.id, 'notification', {
            user_id: target.id,
            status: 'unread',
            data: {text: decision === 'approved' ? 'تمت الموافقة على تسجيلك وربط حسابك بالحَلقة والبيانات الخاصة بك.' : 'لم تتم الموافقة على طلب التسجيل.'}
        }));
        await database().batch(ops);
        return {ok: true};
    }
    if (action === 'link') {
        admin(u);
        const target = await one("SELECT * FROM users WHERE id=? AND status='active'", d.user_id);
        need(target && ['student', 'parent'].includes(target.role), 'اختر حساب طالب أو ولي أمر نشط');
        await studentAccess(u, d.student_id);
        if (target.role === 'student') need(!await one('SELECT id FROM links WHERE user_id=? AND student_id!=?', target.id, d.student_id), 'حساب الطالب مرتبط بملف آخر');
        await database().batch([statement('INSERT OR IGNORE INTO links VALUES(?,?,?)', uid(), target.id, d.student_id), auditStmt(u.id, 'link', d.student_id, null, {user_id: target.id})]);
        return {ok: true};
    }
    if (action === 'unlink') {
        admin(u);
        const old = await one('SELECT * FROM links WHERE id=?', d.id);
        need(old);
        await database().batch([statement('DELETE FROM links WHERE id=?', d.id), auditStmt(u.id, 'unlink', d.id, old, null)]);
        return {ok: true};
    }
    if (action === 'circle') {
        admin(u);
        need(str(d.name) && str(d.level) && str(d.schedule), 'أكمل اسم الحلقة والمستوى والمواعيد');
        const capacity = Number(d.capacity);
        need(Number.isInteger(capacity) && capacity > 0 && capacity < 1000, 'السعة غير صحيحة');
        const id = d.id || uid();
        const old = d.id ? await one('SELECT * FROM circles WHERE id=?', id) : null;
        need(!d.id || old);
        const teachers = Array.isArray(d.teachers) ? d.teachers : [];
        for (const t of teachers) need(await one("SELECT id FROM users WHERE id=? AND role IN ('sheikh','assistant') AND status='active'", t), 'أحد المشايخ غير نشط');
        const statements = [statement('INSERT INTO circles VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,level=excluded.level,type=excluded.type,schedule=excluded.schedule,capacity=excluded.capacity,status=excluded.status,details=excluded.details', id, str(d.name, 120), str(d.level, 120), pick(d.type, ['حضوري', 'أونلاين']), str(d.schedule, 500), capacity, pick(d.status || 'active', ['active', 'paused', 'archived']), JSON.stringify({
            duration: Number(d.duration) || 60,
            branch: str(d.branch),
            fee: money(d.fee || 0),
            ramadan_schedule: str(d.ramadan_schedule)
        }), old?.created || now()), statement('DELETE FROM assignments WHERE circle_id=?', id), ...teachers.map((t: string) => statement('INSERT INTO assignments VALUES(?,?,?)', uid(), id, t)), auditStmt(u.id, 'circle', id, old, d)];
        await database().batch(statements);
        return {ok: true, id};
    }
    if (action === 'student') {
        admin(u);
        need(str(d.name).length >= 3 && str(d.level), 'اكتب الاسم والمستوى');
        const id = d.id || uid();
        const old = d.id ? await one('SELECT * FROM students WHERE id=?', id) : null;
        need(!d.id || old);
        if (d.circle_id) {
            const c = await one("SELECT * FROM circles WHERE id=? AND status='active'", d.circle_id);
            need(c, 'الحلقة غير نشطة');
            const count = await one("SELECT count(*) n FROM students WHERE circle_id=? AND status='active' AND id!=?", d.circle_id, id);
            need(count.n < c.capacity, 'الحلقة مكتملة؛ اختر قائمة الانتظار أو حلقة أخرى');
        }
        const details = {
            birthdate: str(d.birthdate),
            guardian_name: str(d.guardian_name),
            guardian_phone: str(d.guardian_phone),
            address: str(d.address),
            school: str(d.school),
            notes: str(d.notes),
            consent: !!d.consent,
            gender: str(d.gender),
            enrollment_date: d.enrollment_date ? date(d.enrollment_date) : now().slice(0, 10)
        };
        const ops = [statement('INSERT INTO students VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,phone=excluded.phone,circle_id=excluded.circle_id,level=excluded.level,status=excluded.status,details=excluded.details', id, str(d.name, 120), str(d.phone, 30), d.circle_id || null, str(d.level, 120), pick(d.status || 'active', ['active', 'paused', 'archived']), JSON.stringify(details), old?.created || now()), auditStmt(u.id, 'student', id, old, d)];
        if (old && (old.circle_id !== d.circle_id || old.level !== d.level)) {
            ops.push(recordStmt(u.id, 'transfer', {
                student_id: id,
                circle_id: d.circle_id,
                data: {from: old.circle_id, to: d.circle_id, old_level: old.level, new_level: d.level}
            }));
            if (old.circle_id) {
                const waiting = await one("SELECT * FROM records WHERE kind='waitlist' AND circle_id=? AND status='waiting' ORDER BY created LIMIT 1", old.circle_id);
                if (waiting) ops.push(statement("UPDATE records SET status='notified' WHERE id=?", waiting.id), ...await notifyStudent(u.id, waiting.student_id, 'أصبح هناك مقعد متاح في الحلقة المطلوبة. تواصل مع الإدارة لتأكيد النقل.'));
            }
        }
        await database().batch(ops);
        return {ok: true, id};
    }
// One transaction for the student's lesson; deterministic IDs make retries safe.
    if (action === 'lesson') {
        need(['admin', 'sheikh', 'assistant'].includes(u.role), 'غير مسموح', 403);
        const pupil = await studentAccess(u, d.student_id);
        need(pupil.status === 'active', 'ملف الطالب غير نشط');
        const day = date(d.date);
        need(pupil.circle_id && pupil.circle_id === d.circle_id, 'تغيرت حلقة الطالب؛ أعد تحميل الصفحة');
        await circleAccess(u, pupil.circle_id);
        const existing = await all("SELECT * FROM records WHERE student_id=? AND date=? AND status!='void' AND kind IN ('attendance','memorization','revision','plan','assessment')", pupil.id, day);
        const items: any[] = [];
        if (d.attendance) {
            const value = {
                attendance: pick(d.attendance.attendance, ['حاضر', 'غائب', 'متأخر', 'بعذر']),
                check_in: str(d.attendance.check_in, 5),
                check_out: str(d.attendance.check_out, 5)
            };
            for (const t of [value.check_in, value.check_out]) need(!t || /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(t), 'وقت غير صحيح');
            need(!value.check_in || !value.check_out || value.check_out >= value.check_in, 'الانصراف يسبق الحضور');
            if (['غائب', 'بعذر'].includes(value.attendance)) {
                value.check_in = '';
                value.check_out = '';
            }
            items.push({kind: 'attendance', data: value, status: 'active'});
        }
        const attendance = d.attendance?.attendance || existing.find(r => r.kind === 'attendance') && JSON.parse(existing.find(r => r.kind === 'attendance').data).attendance;
        for (const kind of ['memorization', 'revision', 'plan']) {
            if (!d[kind]) continue;
            const v = d[kind];
            const from = Number(v.from), to = Number(v.to);
            need(str(v.surah) && Number.isInteger(from) && Number.isInteger(to) && from >= 1 && to >= from && to <= 286, 'راجع السورة والآيات');
            const value: any = {surah: str(v.surah, 120), from, to, notes: str(v.notes, 1000)};
            if (kind === 'plan') {
                value.due = date(v.due);
                need(value.due >= day, 'موعد المطلوب لا يسبق الحلقة');
            } else {
                need(['حاضر', 'متأخر'].includes(attendance), 'لا يمكن تسجيل تسميع لطالب غائب');
                if (v.grade !== '' && v.grade !== undefined) {
                    value.grade = Number(v.grade);
                    need(Number.isFinite(value.grade) && value.grade >= 0 && value.grade <= 100, 'التقييم من 0 إلى 100');
                }
            }
            items.push({kind, data: value, status: kind === 'plan' ? 'assigned' : 'active'});
        }
        if (d.entries !== undefined) {
            need(Array.isArray(d.entries) && d.entries.length <= 40, 'يمكن حفظ 40 مقطعًا في المرة الواحدة');
            const keys = new Set();
            for (const entry of d.entries) {
                const kind = pick(entry.kind, ['memorization', 'revision', 'plan', 'assessment']);
                need(typeof entry.key === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(entry.key) && !keys.has(entry.key), 'معرّف المقطع غير صحيح أو مكرر');
                keys.add(entry.key);
                if (kind !== 'plan') need(['حاضر', 'متأخر'].includes(attendance), 'لا يمكن تسجيل تسميع أو اختبار لطالب غائب');
                items.push({
                    kind,
                    key: entry.key,
                    data: learningData(kind, entry.data || {}, day),
                    status: kind === 'plan' ? 'assigned' : 'active'
                });
            }
        }
        need(attendance, 'حدد حضور الطالب أولًا');
        need(items.length, 'لا توجد بيانات جديدة للحفظ');
        const ops = [];
        for (const item of items) {
            const id = 'lesson-' + await digest(pupil.id + '|' + day + '|' + item.kind + (item.key ? '|' + item.key : ''));
            const prior = existing.filter(r => item.key ? r.id === id : r.kind === item.kind);
            if (prior.length) {
                need(prior.some(r => r.id === id && r.data === JSON.stringify(item.data)), 'يوجد سجل محفوظ بالفعل؛ حدّث الصفحة قبل المتابعة', 409);
                continue;
            }
            const value = {
                student_id: pupil.id,
                circle_id: pupil.circle_id,
                date: day,
                status: item.status,
                data: item.data
            };
            ops.push(recordStmt(u.id, item.kind, value, id), auditStmt(u.id, 'lesson_' + item.kind, id, null, value));
        }
        if (ops.length) {
            ops.push(...await notifyStudent(u.id, pupil.id, 'تم تحديث متابعة الحلقة: الحضور والتسميع والمطلوب القادم.'));
            await database().batch(ops);
        }
        return {ok: true};
    }
    if (action === 'record') {
        const kind = pick(d.kind, ['attendance', 'memorization', 'revision', 'assessment', 'plan', 'subscription', 'payment', 'note', 'expense', 'message', 'content', 'waitlist', 'salary_config']);
        let data = d.data || {};
        const sid = d.student_id || null;
        let cid = d.circle_id || null, userId = d.user_id || null, amount = 0, status = 'active';
        const day = date(d.date || now().slice(0, 10));
        if (['attendance', 'memorization', 'revision', 'assessment', 'plan', 'note'].includes(kind)) {
            need(['admin', 'sheikh', 'assistant'].includes(u.role), 'غير مسموح', 403);
            const s = await studentAccess(u, sid);
            cid = s.circle_id;
            need(s.status === 'active', 'ملف الطالب غير نشط');
        }
        if (['subscription', 'payment', 'content', 'waitlist', 'salary_config'].includes(kind)) admin(u);
        if (['subscription', 'payment', 'waitlist'].includes(kind)) await studentAccess(u, sid);
        if (kind === 'attendance') {
            pick(data.attendance, ['حاضر', 'غائب', 'متأخر', 'بعذر']);
            if (data.check_in && data.check_out) need(data.check_out >= data.check_in, 'وقت الانصراف يسبق الحضور');
            need(!await one("SELECT id FROM records WHERE kind='attendance' AND student_id=? AND date=? AND status!='void'", sid, day), 'تم تسجيل حضور هذا الطالب لهذا اليوم');
        }
        if ((['memorization', 'revision'].includes(kind) && data.rating) || kind === 'plan' && planTypes.includes(data.plan_type) || kind === 'assessment' && data.from_surah) {
            data = learningData(kind, data, day);
        }
        if (['memorization', 'revision', 'plan'].includes(kind)) {
            need(str(data.surah) && Number(data.from) >= 1 && Number(data.to) >= Number(data.from) && Number(data.to) <= 286, 'راجع السورة ونطاق الآيات');
            need(!data.grade || Number(data.grade) >= 0 && Number(data.grade) <= 100, 'التقييم من 0 إلى 100');
            if (kind === 'plan') {
                date(data.due);
                status = 'assigned';
            }
        }
        if (kind === 'assessment') {
            need(str(data.title) && Number(data.score) >= 0 && Number(data.score) <= 100, 'حدد الاختبار والدرجة من 100');
        }
        if (['subscription', 'payment', 'expense'].includes(kind)) {
            amount = money(d.amount);
            need(amount > 0, 'المبلغ يجب أن يكون أكبر من صفر');
        }
        if (kind === 'subscription') {
            date(data.due);
            need(str(data.title), 'حدد اسم الاشتراك');
            status = 'due';
        }
        if (kind === 'payment') {
            const sub = await one("SELECT * FROM records WHERE id=? AND kind='subscription' AND student_id=? AND status!='void'", d.parent_id, sid);
            need(sub, 'اختر الاشتراك الصحيح');
            const paid = await one("SELECT COALESCE(sum(amount),0) n FROM records WHERE kind='payment' AND parent_id=? AND status!='void'", sub.id);
            need(amount <= sub.amount - paid.n, 'المبلغ أكبر من المتبقي');
            pick(data.method, ['نقدي', 'تحويل بنكي', 'محفظة إلكترونية']);
        }
        if (kind === 'expense') {
            need(['admin', 'sheikh', 'assistant'].includes(u.role), 'غير مسموح', 403);
            userId = isStaff(u) ? u.id : userId;
            need(await one("SELECT id FROM users WHERE id=? AND role IN ('sheikh','assistant')", userId), 'اختر الشيخ');
            need(str(data.reason) && str(data.category), 'أكمل سبب المصروف ونوعه');
            if (data.receipt) need(await one('SELECT id FROM files WHERE id=? AND owner_id=?', data.receipt, u.id), 'الإيصال غير متاح');
            status = 'pending';
        }
        if (kind === 'salary_config') {
            need(await one("SELECT id FROM users WHERE id=? AND role IN ('sheikh','assistant')", userId), 'اختر الشيخ');
            pick(data.method, ['hourly', 'session', 'monthly', 'mixed']);
            data.rate = money(data.rate);
            data.fixed = money(data.fixed || 0);
        }
        if (kind === 'message') {
            need(str(data.text), 'اكتب الرسالة');
            if (u.role === 'admin') {
                if (userId) need(await one("SELECT id FROM users WHERE id=? AND status='active'", userId));
                if (cid) need(await one('SELECT id FROM circles WHERE id=?', cid));
            } else if (isStaff(u)) {
                need(cid, 'اختر حلقة');
                await circleAccess(u, cid);
                userId = null;
            } else {
                const a = await one("SELECT id FROM users WHERE role='admin' AND status='active'");
                userId = a.id;
                cid = null;
            }
        }
        if (kind === 'content') {
            if (data.receipt) need(await one("SELECT id FROM files WHERE id=? AND owner_id=? AND type LIKE 'image/%'", data.receipt, u.id), 'اختر صورة صالحة');
            need(str(data.title) && str(data.text), 'أكمل العنوان والمحتوى');
            pick(data.category, ['عن الدار', 'برنامج', 'أخبار', 'نشاط', 'إنجاز', 'شيخ', 'تواصل', 'معرض']);
            status = pick(d.status || 'draft', ['draft', 'published']);
            if (sid) {
                const s = await studentAccess(u, sid);
                need(JSON.parse(s.details).consent, 'لا يوجد إذن لنشر بيانات هذا الطالب');
            }
        }
        if (kind === 'waitlist') {
            need(await one("SELECT id FROM circles WHERE id=? AND status='active'", cid), 'اختر الحلقة');
            need(!await one("SELECT id FROM records WHERE kind='waitlist' AND student_id=? AND circle_id=? AND status IN ('waiting','notified')", sid, cid), 'الطالب في قائمة الانتظار بالفعل');
            status = 'waiting';
        }
        const id = uid();
        const value = {
            student_id: sid,
            circle_id: cid,
            user_id: userId,
            parent_id: d.parent_id || null,
            date: day,
            amount,
            status,
            data
        };
        const ops = [recordStmt(u.id, kind, value, id), auditStmt(u.id, kind, id, null, value)];
        if (sid && ['attendance', 'memorization', 'revision', 'assessment', 'plan', 'subscription', 'payment'].includes(kind)) ops.push(...await notifyStudent(u.id, sid, ({
            attendance: 'تم تحديث حضور الطالب',
            memorization: 'تم تسجيل حفظ جديد',
            revision: 'تم تسجيل المراجعة',
            assessment: 'تم تسجيل تقييم جديد',
            plan: 'تم تحديد المطلوب للحلقة القادمة',
            subscription: 'تم إضافة اشتراك مستحق',
            payment: 'تم تسجيل دفعة جديدة'
        } as any)[kind]));
        await database().batch(ops);
        return {ok: true, id};
    }
    if (action === 'record_status') {
        const old = await one('SELECT * FROM records WHERE id=?', d.id);
        need(old, 'السجل غير موجود');
        let status = d.status;
        const ops = [];
        if (old.kind === 'expense') {
            admin(u);
            need(old.status === 'pending', 'تمت مراجعة المصروف بالفعل');
            pick(status, ['approved', 'rejected']);
            ops.push(recordStmt(u.id, 'notification', {
                user_id: old.user_id,
                data: {text: status === 'approved' ? 'تمت الموافقة على المصروف' : 'لم تتم الموافقة على المصروف'},
                status: 'unread'
            }));
        } else if (old.kind === 'plan') {
            const g = JSON.parse((await one("SELECT value FROM settings WHERE id='general'"))?.value || '{}');
            if (g.restrict_access) {
                const overdue = await one("SELECT id FROM records s WHERE kind='subscription' AND student_id=? AND status!='void' AND date(json_extract(data,'$.due'), '+' || ? || ' days')<date('now') AND amount>(SELECT COALESCE(SUM(p.amount),0) FROM records p WHERE p.kind='payment' AND p.parent_id=s.id AND p.status!='void')", old.student_id, Number(g.overdue_days) || 0);
                need(!overdue, 'راجع الإدارة بشأن الاشتراك لاستعادة الوصول إلى خطة الحفظ', 403);
            }
            need(u.role === 'student', 'حساب الطالب فقط يمكنه تعليم المهمة كمكتملة', 403);
            await studentAccess(u, old.student_id);
            status = 'completed';
        } else if (['message', 'notification'].includes(old.kind)) {
            need(old.user_id === u.id, 'غير مسموح', 403);
            status = 'read';
        } else if (old.kind === 'waitlist') {
            admin(u);
            status = 'closed';
        } else if (old.kind === 'content') {
            admin(u);
            pick(status, ['draft', 'published']);
            if (status === 'published' && old.student_id) {
                const st = await studentAccess(u, old.student_id);
                need(JSON.parse(st.details).consent, 'لا يوجد إذن بالنشر لهذا الطالب');
            }
        } else {
            admin(u);
            need(old.kind !== 'registration', 'راجع الطلب من قسم طلبات التسجيل');
            if (old.kind === 'subscription') need(!await one("SELECT id FROM records WHERE kind='payment' AND parent_id=?", old.id), 'اشتراك مرتبط بمدفوعات لا يمكن إلغاؤه');
            need(!['salary', 'payment'].includes(old.kind), 'السجل المالي المقفل يحتاج تسوية مستقلة');
            status = 'void';
        }
        ops.push(statement('UPDATE records SET status=? WHERE id=?', status, old.id), auditStmt(u.id, 'record_status', old.id, old, {status}));
        await database().batch(ops);
        return {ok: true};
    }
    if (action === 'checkout') {
        need(['admin', 'sheikh', 'assistant'].includes(u.role), 'غير مسموح', 403);
        const old = await one("SELECT * FROM records WHERE id=? AND kind='attendance' AND status!='void'", d.id);
        need(old, 'السجل غير موجود');
        await studentAccess(u, old.student_id);
        const data = JSON.parse(old.data);
        need(['حاضر', 'متأخر'].includes(data.attendance) && !data.check_out, 'الانصراف مسجل بالفعل أو الطالب غائب');
        const time = str(d.time, 5);
        need(/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time) && (!data.check_in || time >= data.check_in), 'وقت الانصراف غير صحيح');
        data.check_out = time;
        await database().batch([statement('UPDATE records SET data=? WHERE id=?', JSON.stringify(data), old.id), auditStmt(u.id, 'student_checkout', old.id, JSON.parse(old.data), data)]);
        return {ok: true};
    }
    if (action === 'staff_attendance') {
        need(['admin', 'sheikh', 'assistant'].includes(u.role), 'غير مسموح', 403);
        const mode = pick(d.mode, ['in', 'out', 'absent', 'excused']);
        const userId = isStaff(u) ? u.id : d.user_id;
        need(await one("SELECT id FROM users WHERE id=? AND role IN ('sheikh','assistant') AND status='active'", userId), 'اختر شيخًا نشطًا');
        const open = await one("SELECT * FROM records WHERE kind='staff_attendance' AND user_id=? AND status='open'", userId);
        const day = ['absent', 'excused'].includes(mode) ? date(d.date || now().slice(0, 10)) : mode === 'out' && open ? open.date : new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Africa/Cairo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(new Date());
        need(!await one("SELECT id FROM records WHERE kind='salary' AND user_id=? AND date=?", userId, day.slice(0, 7) + '-01'), 'مرتب هذا الشهر مقفل؛ سجل التصحيح كتسوية في الشهر التالي', 409);
        if (mode === 'out') {
            need(open, 'لا يوجد حضور مفتوح');
            const data = JSON.parse(open.data);
            data.check_out = now();
            data.minutes = Math.max(0, Math.round((Date.now() - Date.parse(data.check_in)) / 60000));
            data.sessions = 1;
            await database().batch([statement("UPDATE records SET status='closed',data=? WHERE id=? AND status='open'", JSON.stringify(data), open.id), auditStmt(u.id, 'staff_out', open.id, open, data)]);
            return {ok: true};
        }
        need(!open, 'سجل انصراف الحلقة الحالية أولًا');
        const cid = str(d.circle_id);
        need(await one("SELECT c.id FROM circles c JOIN assignments a ON a.circle_id=c.id WHERE c.id=? AND a.user_id=? AND c.status='active'", cid, userId), 'اختر حلقة نشطة مسندة لهذا الشيخ');
        need(!await one("SELECT id FROM records WHERE kind='staff_attendance' AND user_id=? AND circle_id=? AND date=? AND status!='void'", userId, cid, day), 'تم تسجيل هذه الحلقة لهذا الشيخ في هذا اليوم');
        const id = uid();
        const value = {
            user_id: userId,
            circle_id: cid,
            date: day,
            status: mode === 'in' ? 'open' : 'closed',
            data: mode === 'in' ? {
                check_in: now(),
                attendance: 'حاضر',
                minutes: 0,
                sessions: 0
            } : {attendance: mode === 'absent' ? 'غائب' : 'بعذر', minutes: 0, sessions: 0, reason: str(d.reason)}
        };
        await database().batch([recordStmt(u.id, 'staff_attendance', value, id), auditStmt(u.id, mode === 'in' ? 'staff_in' : 'staff_absence', id, null, value)]);
        return {ok: true};
    }
    if (action === 'salary') {
        admin(u);
        const month = str(d.month);
        need(/^\d{4}-\d{2}$/.test(month), 'حدد الشهر');
        const userId = d.user_id;
        need(!await one("SELECT id FROM records WHERE kind='salary' AND user_id=? AND date=?", userId, month + '-01'), 'كشف هذا الشهر مقفل بالفعل');
        const config = await one("SELECT * FROM records WHERE kind='salary_config' AND user_id=? AND date<=? AND status!='void' ORDER BY date DESC,created DESC LIMIT 1", userId, month + '-31');
        need(config, 'حدد نظام المرتب أولًا');
        const c = JSON.parse(config.data);
        need(!await one("SELECT id FROM records WHERE kind='staff_attendance' AND user_id=? AND date LIKE ? AND status='open'", userId, month + '%'), 'سجل انصراف الحلقات المفتوحة قبل إقفال المرتب');
        const attendance = await all("SELECT * FROM records WHERE kind='staff_attendance' AND user_id=? AND date LIKE ? AND status='closed'", userId, month + '%');
        const hours = attendance.reduce((n, r) => n + JSON.parse(r.data).minutes / 60, 0);
        const sessions = attendance.reduce((n, r) => n + JSON.parse(r.data).sessions, 0);
        const expenses = await all("SELECT e.* FROM records e WHERE e.kind='expense' AND e.user_id=? AND e.date<=? AND e.status='approved' AND NOT EXISTS (SELECT 1 FROM records s,json_each(s.data,'$.expense_ids') j WHERE s.kind='salary' AND j.value=e.id)", userId, month + '-31');
        const exp = expenses.reduce((n, r) => n + r.amount, 0);
        const additions = money(d.additions || 0), deductions = money(d.deductions || 0);
        let sessionBase = 0;
        const lines: any[] = [];
        if (c.method === 'session') {
            for (const r of attendance) {
                const rd = JSON.parse(r.data);
                if (!rd.check_in || !rd.check_out || rd.attendance !== 'حاضر') continue;
                const effective = await one("SELECT * FROM records WHERE kind='salary_config' AND user_id=? AND date<=? AND status!='void' ORDER BY date DESC,created DESC LIMIT 1", userId, r.date);
                need(effective && JSON.parse(effective.data).method === 'session', 'حدد قيمة الحلقة بتاريخ يسري على جميع سجلات الحضور في الشهر');
                const rate = JSON.parse(effective.data).rate;
                const count = r.circle_id ? 1 : Number(rd.sessions || 0);
                const amount = count * rate;
                sessionBase += amount;
                lines.push({
                    attendance_id: r.id,
                    circle_id: r.circle_id,
                    circle_name: r.circle_id ? (await one('SELECT name FROM circles WHERE id=?', r.circle_id))?.name : 'سجل حضور سابق',
                    date: r.date,
                    sessions: count,
                    rate,
                    amount
                });
            }
        }
        const base = Math.round(c.method === 'hourly' ? hours * c.rate : c.method === 'session' ? sessionBase : c.method === 'monthly' ? c.fixed : c.fixed + hours * c.rate);
        const net = base + exp + additions - deductions;
        need(net >= 0, 'صافي المرتب لا يمكن أن يكون سالبًا');
        const value = {
            user_id: userId,
            date: month + '-01',
            amount: net,
            status: 'locked',
            data: {
                hours,
                sessions,
                lines,
                base,
                expenses: exp,
                additions,
                deductions,
                method: c.method,
                notes: str(d.notes),
                expense_ids: expenses.map(x => x.id)
            }
        };
        const id = uid();
        await database().batch([recordStmt(u.id, 'salary', value, id), auditStmt(u.id, 'salary_lock', id, null, value)]);
        return {ok: true, id};
    }
    if (action === 'restore') {
        admin(u);
        const snap = d.snapshot;
        need(snap && snap.version === 1, 'صيغة النسخة غير صحيحة');
        const columns: any = {
            users: ['id', 'name', 'phone', 'password', 'role', 'status', 'platform_id', 'details', 'created'],
            circles: ['id', 'name', 'level', 'type', 'schedule', 'capacity', 'status', 'details', 'created'],
            assignments: ['id', 'circle_id', 'user_id'],
            students: ['id', 'name', 'phone', 'circle_id', 'level', 'status', 'details', 'created'],
            links: ['id', 'user_id', 'student_id'],
            records: ['id', 'kind', 'student_id', 'circle_id', 'user_id', 'actor_id', 'parent_id', 'date', 'status', 'amount', 'data', 'created'],
            audit: ['id', 'actor_id', 'action', 'entity', 'before_value', 'after_value', 'created'],
            files: ['id', 'owner_id', 'name', 'type', 'created'],
            settings: ['id', 'value']
        };
        let count = 0;
        const ops = [];
        for (const [table, cols] of Object.entries(columns) as [string, string[]][]) {
            need(Array.isArray(snap[table]), 'نسخة ناقصة');
            for (const row of snap[table]) {
                need(cols.every(c => c in row), 'سجل غير صالح');
                need(++count <= 5000, 'استعادة هذه النسخة تتطلب تقسيمها من المسؤول التقني');
                ops.push(statement(`INSERT OR IGNORE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, ...cols.map(c => row[c])));
            }
        }
        ops.push(auditStmt(u.id, 'restore', 'system', null, {records: count, source: snap.created}));
        await database().batch(ops);
        return {ok: true};
    }
    if (action === 'settings') {
        admin(u);
        const value = {
            name: 'دار الطفل المسلم',
            contact: str(d.contact),
            address: str(d.address),
            ramadan: !!d.ramadan,
            overdue_days: Math.max(0, Number(d.overdue_days) || 0),
            restrict_access: !!d.restrict_access
        };
        const old = await one("SELECT * FROM settings WHERE id='general'");
        await database().batch([statement("INSERT INTO settings VALUES('general',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value", JSON.stringify(value)), auditStmt(u.id, 'settings', 'general', old, value)]);
        return {ok: true};
    }
    throw new AppError('العملية غير متاحة', 404);
}

async function handle(req: Request, fn: (r: Request) => Promise<any>) {
    try {
        const r = await fn(req);
        if (r instanceof Response) return r;
        return Response.json(r, {headers: {'Cache-Control': 'no-store'}});
    } catch (e: any) {
        console.error('academy request failed', e.message);
        const constraint = String(e.message).includes('phone_verification_required') ? 'تأكيد الهاتف مطلوب لاستخدام نفس الرقم لحساب آخر' : String(e.message).includes('staff_salary_locked') ? 'راجع الحضور المفتوح أو كشف المرتب المقفل؛ لم يتم حفظ التغيير' : String(e.message).includes('registration_conflict') ? 'تغيرت حالة الطلب أو صلاحية مراجعته؛ حدّث الصفحة' : String(e.message).includes('circle_full') ? 'الحلقة مكتملة؛ لم يتم حفظ التغيير' : String(e.message).includes('invalid_payment_balance') ? 'تغير الرصيد المستحق؛ حدّث الصفحة وراجع المبلغ' : String(e.message).includes('UNIQUE constraint') ? 'هذا السجل موجود بالفعل؛ حدّث الصفحة' : String(e.message).includes('circle_capacity_below_enrollment') ? 'السعة أقل من عدد الطلاب الحالي' : null;
        if (constraint) return Response.json({error: constraint}, {status: 409});
        return Response.json({error: e instanceof AppError ? e.message : 'تعذر إتمام العملية الآن. بياناتك المدخلة محفوظة في النموذج؛ حاول مجددًا.'}, {
            status: e instanceof AppError ? e.status : 500,
            headers: {'Cache-Control': 'no-store'}
        });
    }
}

export const GET = (r: Request) => handle(r, get);
export const POST = (r: Request) => handle(r, post);
