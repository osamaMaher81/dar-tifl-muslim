# نشر النسخة على سيرفرك

## المطلوب قبل التنفيذ الفعلي

معرفة مزود الاستضافة، نظام التشغيل، دعم Docker/Node.js 24، الدومين، وطريقة الوصول المصرح بها. لم يتم الاتصال بسيرفر خارجي أو نقل بيانات الإنتاج ضمن تجهيز هذه الحزمة. إعداد nginx المرفق جزء يُضاف إلى HTTPS server block بعد إصدار شهادة نطاقك.

## Docker على VPS Linux

1. ثبّت Docker وCompose، وانسخ الكود إلى مجلد خاص، مثل `/opt/dar`، وليس public_html.
2. أنشئ `.env` من المثال، وضع `APP_ORIGIN=https://YOUR-DOMAIN` و`TRUST_PROXY=1`. ضع بيانات Twilio اختياريًا. اترك DATA_DIR؛ Compose يحدد `/app/data`.
3. نفّذ:

```sh
docker compose build
docker compose run --rm app node scripts/migrate.mjs
```

للبداية الجديدة فقط، أضف ADMIN_PASSWORD مؤقتًا في `.env` ثم:

```sh
docker compose run --rm app node scripts/admin.mjs
```

للنقل بدل البداية الجديدة، انسخ مجلد التصدير إلى `backups/migration-export` وشغّل على volume فارغ:

```sh
docker compose run --rm -v ./backups/migration-export:/migration:ro app node scripts/import.mjs /migration/snapshot.json /migration/media
```

4. احذف كلمات المرور المؤقتة من `.env`، ثم:

```sh
docker compose up -d
docker compose logs --tail=50 app
```

5. وجّه DNS إلى السيرفر. جهّز nginx وشهادة HTTPS عبر أدوات الاستضافة أو Certbot وأضف المقتطف الموجود في deployment/nginx.conf. افتح 80/443 للعامة واترك 3000 على loopback فقط. يجب أن يطابق APP_ORIGIN النطاق الذي يستخدمه الزائر؛ اختلافه يمنع عمليات الحفظ لحماية الطلبات.
6. اختبر الدخول وحفظ طالب ورفع صورة، ثم إعادة تشغيل الخدمة. تحقق من وجود البيانات والملفات بعدها. SQLite وuploads محفوظان في volume اسمه academy-data تحت اسم مشروع Compose.

### التحديث

خذ نسخة احتياطية متسقة أولًا، ثم:

```sh
docker compose up -d --build
```

الترحيلات تُطبق تلقائيًا عند بدء التشغيل. لا تستخدم `docker compose down -v`؛ هذا يحذف قاعدة البيانات والصور. تثبيت الكود وحده لا يلغي ترحيلًا؛ الرجوع يتطلب كودًا ونسخة بيانات متوافقين.

### نسخ volume احتياطيًا

```sh
mkdir -p backups
docker compose stop app
docker compose run --rm --user 0 -v ./backups:/backup app sh -c 'tar -czf /backup/academy-data.tar.gz -C /app/data . && chmod 600 /backup/academy-data.tar.gz'
docker compose start app
```

غيّر اسم النسخة في كل مرة لتجنب استبدال السابقة. انقل النسخة المشفرة إلى مكان خارج السيرفر. للاسترجاع على **volume جديد فارغ فقط**:

```sh
docker compose run --rm --user 0 -v ./backups:/backup:ro app sh -c 'tar -xzf /backup/academy-data.tar.gz -C /app/data && chown -R node:node /app/data'
docker compose up -d
```

## بدون Docker

يعمل على Node.js 24. نفّذ README، واجعل DATA_DIR مسارًا مطلقًا دائمًا خارج مجلد إصدارات الكود، ثم شغّل `npm start` بمستخدم محدود عبر systemd أو مدير العمليات الخاص بالاستضافة. لا تشغّله بأكثر من process واحد ولا تجعل DATA_DIR مجلدًا مؤقتًا. اجعل nginx أمام 127.0.0.1:3000. ملف `.env` خاص بمستخدم التطبيق فقط، مثل صلاحية 600 على Linux.

لو الاستضافة cPanel تدعم PHP فقط فهذه الحزمة لا تعمل عليها. لو تدعم Node.js تحتاج التأكد من Node 24، صلاحية تخزين الملفات، مدير العمليات وطريقة تهيئة البيئة؛ لا يمكن إعدادها نهائيًا بدون تفاصيل استضافتك.

## قائمة مراجعة الإطلاق

- [ ] تجهيز Node.js 24 أو Docker وقرص دائم محلي.
- [ ] تثبيت الاعتمادات من lockfile وبناء ناجح.
- [ ] إعداد APP_ORIGIN وHTTPS وDNS.
- [ ] منع منفذ 3000 والملفات الخاصة عن الإنترنت.
- [ ] تصدير البيانات وكل الصور في فترة توقف الإدخال.
- [ ] استيراد النسخة قبل إنشاء إدارة جديدة ومقارنة الأعداد.
- [ ] اختبار الأدوار الخمسة وعزل بيانات الحلقات وصلاحيات المراجعة.
- [ ] اختبار الحضور والتسميع والاشتراكات والمرتبات والصور.
- [ ] إعادة تشغيل السيرفر والتحقق من استمرار البيانات.
- [ ] حفظ نسخة احتياطية خارج السيرفر وتجربة استرجاعها.
- [ ] حذف كلمات المرور المؤقتة وعدم وضع أسرار في Git.
- [ ] مراقبة المساحة والأخطاء وتطبيق تحديثات الأمان.
- [ ] تفعيل مزود الرسائل واختبار إرسال حقيقي إن كان مطلوبًا.
- [ ] فتح الاستخدام الجديد بعد التحقق، وإبقاء القديم للرجوع فترة متفقًا عليها.

## ما تم اختباره وما لم يُختبر

تم بناء التطبيق الفعلي وتشغيله محليًا على Node.js 24، واختبار الوظائف على SQLite والتخزين المحلي. راجع VALIDATION.md للنتائج النهائية. لم يُنشر على سيرفرك لأنه غير محدد ولم تُوفّر وسيلة وصول. تكامل Twilio الحقيقي ونطاقك وTLS وتوفر Docker في الاستضافة يحتاجون تحققًا في بيئتك.
