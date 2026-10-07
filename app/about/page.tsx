'use client';
import {DarSignature, SiteFooter} from '../brand-design';
import {useEffect, useState} from 'react';
import {ArrowUpLeft, BookOpen, Clock, Users} from 'lucide-react';

export default function About() {
    const [data, setData] = useState<any>(null), [error, setError] = useState('');
    useEffect(() => {
        fetch('/api/app?action=public').then(r => {
            if (!r.ok) throw new Error('تعذر تحميل بيانات الدار');
            return r.json();
        }).then(setData).catch(e => setError(e.message));
    }, []);
    return <div className="auth-page">
        <header className="auth-header"><a href="/" className="brand"><img src="/logo.jpg" alt="شعار دار الطفل المسلم"/>
            <div><strong>دار الطفل المسلم</strong><small>لنشأة جيل أفضل</small></div>
        </a><a className="primary" href="/">الدخول والتسجيل <ArrowUpLeft size={16}/></a></header>
        <main className="public-main">
            <section className="public-hero">
                <div><span className="overline">دار الطفل المسلم</span><DarSignature/><p>حلقات تعليمية لحفظ القرآن
                    الكريم ومراجعته، بمتابعة تجمع الطالب والشيخ وولي الأمر في رحلة واحدة.</p><a className="primary"
                                                                                                href="/">اطلب الانضمام
                    إلى الدار <ArrowUpLeft size={17}/></a></div>
                <img src="/logo.jpg" alt="دار الطفل المسلم — لنشأة جيل أفضل"/></section>
            {error && <p role="alert">{error}</p>}{data && <>
            <section className="stats-grid">
                <article className="stat-card"><Users/><h2>{data.stats.students}</h2><p>طالب في الدار</p></article>
                <article className="stat-card"><BookOpen/><h2>{data.stats.circles}</h2><p>حلقة تعليمية</p></article>
            </section>
            {['عن الدار', 'برنامج', 'أخبار', 'نشاط', 'إنجاز', 'شيخ', 'معرض', 'تواصل'].map(category => {
                const items = data.content.filter((c: any) => c.data.category === category);
                return !!items.length && <section className="public-section" key={category}><h2>{({
                    برنامج: 'برامجنا',
                    نشاط: 'الأنشطة',
                    إنجاز: 'إنجازات نعتز بها',
                    شيخ: 'مشايخ الدار',
                    معرض: 'معرض الدار'
                } as any)[category] || category}</h2>
                    <div className="circle-grid">{items.map((c: any) => <article className="panel"
                                                                                 key={c.id}>{c.data.receipt &&
                        <img className="content-image" src={`/api/app?action=media&id=${c.data.receipt}`}
                             alt={c.data.title}/>}<h3>{c.data.title}</h3><p>{c.data.text}</p>
                        <small>{new Date(c.date).toLocaleDateString('ar-EG')}</small></article>)}</div>
                </section>;
            })}
            <section className="public-section"><h2>الحلقات المتاحة</h2>
                <div className="circle-grid">{data.circles.map((c: any) => <article className="panel" key={c.id}>
                    <BookOpen color="#087f83"/><h3>{c.name}</h3><p>{c.level} · {c.type}</p><p><Clock size={15}
                                                                                                     className="inline"/> {c.schedule}
                </p><a className="text-btn" href="/">التسجيل <ArrowUpLeft size={16}/></a></article>)}</div>
                {!data.circles.length && <p className="muted">تُنشر مواعيد الحلقات هنا بعد اعتمادها من الإدارة.</p>}
            </section>
        </>}</main>
        <SiteFooter/></div>;
}

function LogoText() {
    return <span>دار الطفل المسلم — لنشأة جيل أفضل</span>;
}
