const env = process.env;

export function otpConfigured() {
    return !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_VERIFY_SERVICE_SID);
}

export function otpChannel() {
    return env.OTP_CHANNEL === 'whatsapp' ? 'whatsapp' : 'sms';
}

export function normalizePhone(input: string) {
    let p = String(input).replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632)).replace(/[\s()-]/g, '');
    if (/^01[0125][0-9]{8}$/.test(p)) p = '+2' + p; else if (p.startsWith('00')) p = '+' + p.slice(2); else if (/^20[0-9]{10}$/.test(p)) p = '+' + p;
    return p;
}

async function verifyRequest(path: string, params: Record<string, string>) {
    if (!otpConfigured()) throw new Error('verification_unavailable');
    const response = await fetch(`https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SERVICE_SID}/${path}`, {
        method: 'POST',
        headers: {
            Authorization: 'Basic ' + btoa(env.TWILIO_ACCOUNT_SID + ':' + env.TWILIO_AUTH_TOKEN),
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams(params),
        signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error('verification_rejected');
    return response.json() as Promise<{ status: string, to?: string }>;
}

export async function sendPhoneCode(phone: string) {
    return verifyRequest('Verifications', {To: phone, Channel: otpChannel(), Locale: 'ar'});
}

export async function checkPhoneCode(phone: string, code: string) {
    const r = await verifyRequest('VerificationCheck', {To: phone, Code: code});
    return r.status === 'approved' && r.to === phone;
}
