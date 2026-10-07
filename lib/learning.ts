export const ratings = ['ممتاز', 'جيد جدا', 'جيد مرتفع', 'جيد', 'ضعيف', 'متوسط', 'إعادة'];
export const revisionTypes = ['ماضي قريب', 'ماضي بعيد'];
export const planTypes = ['جديد', 'ماضي قريب', 'ماضي بعيد'];

export function learningSummary(kind: string, d: any) {
    const scope = kind === 'assessment' && d.from_surah ? `من سورة ${d.from_surah} إلى سورة ${d.to_surah}` : d.surah ? `${d.surah} · الآيات ${d.from} – ${d.to}` : d.title || d.text || '';
    const type = kind === 'revision' ? d.revision_type : kind === 'plan' ? d.plan_type : '';
    const percentage = kind === 'assessment' ? d.score : (d.percentage ?? d.grade);
    return [type, scope, d.rating, percentage !== undefined && percentage !== '' && percentage !== null ? `${percentage}٪` : null, d.due ? `الموعد ${d.due}` : null].filter(Boolean).join(' · ');
}
