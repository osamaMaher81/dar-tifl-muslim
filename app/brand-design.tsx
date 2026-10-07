export function DesignerMark() {
    return <div className="designer-mark" title="تصميم أحمد ياسر"><img src="/ahmed-yasser.png" alt="شعار أحمد ياسر"
                                                                       width="72" height="72"/></div>;
}

export function DarSignature({compact = false}: { compact?: boolean }) {
    return <div className={`dar-signature ${compact ? 'signature-compact' : ''}`}>
        <div className="signature-rule" aria-hidden="true"><span/>✧<span/></div>
        <p className="signature-name">دار الطفل المسلم</p><p className="signature-quote">فاز من اتخذ القرآن صاحبًا</p>
        <div className="signature-rule" aria-hidden="true"><span/>✧<span/></div>
    </div>;
}

export function SiteFooter() {
    return <footer className="site-credit">
        <div><strong>دار الطفل المسلم</strong><span>© {new Date().getFullYear()} جميع حقوق النشر محفوظة لدار الطفل المسلم.</span>
        </div>
        <div className="credit-author"><img src="/ahmed-yasser.png" alt="شعار أحمد ياسر" width="60" height="60"/><a
            className="designer-credit-link" href="https://www.instagram.com/mido_13_12?utm_source=qr" target="_blank"
            rel="noopener noreferrer">صمم بواسطة أحمد ياسر</a></div>
    </footer>;
}
