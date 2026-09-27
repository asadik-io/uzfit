-- UzFit development seed. Applied only by `supabase db reset` on local/dev databases.
-- Everything here is FICTIONAL DEMO DATA: organizations, venues, addresses, schedules, and plan
-- prices are samples, not real partners or approved commercial offers.
-- Demo users, memberships, bookings, and venue photos are created by `pnpm setup:demo`.

-- Local-only operator flags. Production databases never receive these rows.
insert into private.settings (key, value) values
  ('demo_payments_enabled', 'true'::jsonb),
  ('admin_mfa_required', 'false'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
insert into public.cities (id, slug, name, timezone, sort_order) values
  ('c1000000-0000-4000-8000-000000000001', 'tashkent',
   '{"uz": "Toshkent", "ru": "Ташкент", "en": "Tashkent"}', 'Asia/Tashkent', 1);

insert into public.districts (id, city_id, slug, name, sort_order) values
  ('d1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'bektemir', '{"uz": "Bektemir", "ru": "Бектемир", "en": "Bektemir"}', 1),
  ('d1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 'chilonzor', '{"uz": "Chilonzor", "ru": "Чиланзар", "en": "Chilanzar"}', 2),
  ('d1000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000001', 'mirobod', '{"uz": "Mirobod", "ru": "Мирабад", "en": "Mirabad"}', 3),
  ('d1000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000001', 'mirzo-ulugbek', '{"uz": "Mirzo Ulugʻbek", "ru": "Мирзо-Улугбек", "en": "Mirzo Ulugbek"}', 4),
  ('d1000000-0000-4000-8000-000000000005', 'c1000000-0000-4000-8000-000000000001', 'olmazor', '{"uz": "Olmazor", "ru": "Алмазар", "en": "Almazar"}', 5),
  ('d1000000-0000-4000-8000-000000000006', 'c1000000-0000-4000-8000-000000000001', 'sergeli', '{"uz": "Sergeli", "ru": "Сергели", "en": "Sergeli"}', 6),
  ('d1000000-0000-4000-8000-000000000007', 'c1000000-0000-4000-8000-000000000001', 'shayxontohur', '{"uz": "Shayxontohur", "ru": "Шайхантахур", "en": "Shaykhantakhur"}', 7),
  ('d1000000-0000-4000-8000-000000000008', 'c1000000-0000-4000-8000-000000000001', 'uchtepa', '{"uz": "Uchtepa", "ru": "Учтепа", "en": "Uchtepa"}', 8),
  ('d1000000-0000-4000-8000-000000000009', 'c1000000-0000-4000-8000-000000000001', 'yakkasaroy', '{"uz": "Yakkasaroy", "ru": "Яккасарай", "en": "Yakkasaray"}', 9),
  ('d1000000-0000-4000-8000-000000000010', 'c1000000-0000-4000-8000-000000000001', 'yashnobod', '{"uz": "Yashnobod", "ru": "Яшнабад", "en": "Yashnabad"}', 10),
  ('d1000000-0000-4000-8000-000000000011', 'c1000000-0000-4000-8000-000000000001', 'yangihayot', '{"uz": "Yangihayot", "ru": "Янгихаёт", "en": "Yangihayot"}', 11),
  ('d1000000-0000-4000-8000-000000000012', 'c1000000-0000-4000-8000-000000000001', 'yunusobod', '{"uz": "Yunusobod", "ru": "Юнусабад", "en": "Yunusabad"}', 12);

insert into public.categories (id, slug, name, icon, sort_order) values
  ('ca000000-0000-4000-8000-000000000001', 'gym', '{"uz": "Trenajyor zali", "ru": "Тренажёрный зал", "en": "Gym"}', 'dumbbell', 1),
  ('ca000000-0000-4000-8000-000000000002', 'yoga', '{"uz": "Yoga", "ru": "Йога", "en": "Yoga"}', 'flower', 2),
  ('ca000000-0000-4000-8000-000000000003', 'swimming', '{"uz": "Suzish", "ru": "Плавание", "en": "Swimming"}', 'waves', 3),
  ('ca000000-0000-4000-8000-000000000004', 'boxing', '{"uz": "Boks va yakkakurash", "ru": "Бокс и единоборства", "en": "Boxing & martial arts"}', 'swords', 4),
  ('ca000000-0000-4000-8000-000000000005', 'dance', '{"uz": "Raqs", "ru": "Танцы", "en": "Dance"}', 'music', 5),
  ('ca000000-0000-4000-8000-000000000006', 'functional', '{"uz": "Funksional mashgʻulot", "ru": "Функциональный тренинг", "en": "Functional training"}', 'activity', 6);

insert into public.amenities (id, slug, name, icon, sort_order) values
  ('a1000000-0000-4000-8000-000000000001', 'showers', '{"uz": "Dush", "ru": "Душ", "en": "Showers"}', 'shower-head', 1),
  ('a1000000-0000-4000-8000-000000000002', 'lockers', '{"uz": "Kiyim shkaflari", "ru": "Шкафчики", "en": "Lockers"}', 'lock', 2),
  ('a1000000-0000-4000-8000-000000000003', 'parking', '{"uz": "Avtoturargoh", "ru": "Парковка", "en": "Parking"}', 'car', 3),
  ('a1000000-0000-4000-8000-000000000004', 'towels', '{"uz": "Sochiq", "ru": "Полотенца", "en": "Towels"}', 'shirt', 4),
  ('a1000000-0000-4000-8000-000000000005', 'sauna', '{"uz": "Sauna", "ru": "Сауна", "en": "Sauna"}', 'flame', 5),
  ('a1000000-0000-4000-8000-000000000006', 'wifi', '{"uz": "Wi-Fi", "ru": "Wi-Fi", "en": "Wi-Fi"}', 'wifi', 6),
  ('a1000000-0000-4000-8000-000000000007', 'water', '{"uz": "Ichimlik suvi", "ru": "Питьевая вода", "en": "Drinking water"}', 'glass-water', 7),
  ('a1000000-0000-4000-8000-000000000008', 'step-free', '{"uz": "Toʻsiqsiz kirish", "ru": "Доступный вход", "en": "Step-free access"}', 'accessibility', 8);

-- ---------------------------------------------------------------------------
-- Demo partner organizations (three unrelated organizations for access isolation)
-- ---------------------------------------------------------------------------
insert into public.organizations (id, name, is_demo) values
  ('0a000000-0000-4000-8000-000000000001', 'Demo Sport Group', true),
  ('0a000000-0000-4000-8000-000000000002', 'Demo Wellness Studios', true),
  ('0a000000-0000-4000-8000-000000000003', 'Demo Aqua Club', true);

-- ---------------------------------------------------------------------------
-- Demo venues (fictional names and addresses; coordinates approximate district centres)
-- ---------------------------------------------------------------------------
insert into public.venues (id, organization_id, slug, name, description, address, rules, district_id,
                           latitude, longitude, contact_phone, publication_status, published_at, is_demo) values
  ('e1000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', 'olmos-fitness-yunusobod',
   '{"uz": "Olmos Fitness Yunusobod", "ru": "Olmos Fitness Юнусабад", "en": "Olmos Fitness Yunusabad"}',
   '{"uz": "Zamonaviy trenajyorlar, erkin ogʻirliklar zonasi va kichik guruhlarda funksional mashgʻulotlar.", "ru": "Современные тренажёры, зона свободных весов и функциональные тренировки в малых группах.", "en": "Modern machines, a free-weights area, and small-group functional training."}',
   '{"uz": "Yunusobod tumani, Namuna koʻchasi, 12", "ru": "Юнусабадский район, ул. Намуна, 12", "en": "12 Namuna Street, Yunusabad"}',
   '{"uz": "Toza sport poyabzali va sochiq olib keling. Kirishda UzFit QR-kodingizni koʻrsating.", "ru": "Приходите в чистой спортивной обуви и с полотенцем. Покажите QR-код UzFit на ресепшене.", "en": "Bring clean indoor shoes and a towel. Show your UzFit QR code at reception."}',
   'd1000000-0000-4000-8000-000000000012', 41.3656, 69.2891, '+998711000001', 'published', now(), true),
  ('e1000000-0000-4000-8000-000000000002', '0a000000-0000-4000-8000-000000000001', 'olmos-fitness-chilonzor',
   '{"uz": "Olmos Fitness Chilonzor", "ru": "Olmos Fitness Чиланзар", "en": "Olmos Fitness Chilanzar"}',
   '{"uz": "Katta zal, boks ringi va har kuni ochiq trenajyor zali.", "ru": "Просторный зал, боксёрский ринг и ежедневный открытый тренажёрный зал.", "en": "A spacious hall, a boxing ring, and open gym access every day."}',
   '{"uz": "Chilonzor tumani, Namuna koʻchasi, 34", "ru": "Чиланзарский район, ул. Намуна, 34", "en": "34 Namuna Street, Chilanzar"}',
   '{"uz": "Mashgʻulotdan 10 daqiqa oldin keling. Boks qoʻlqoplarini oʻzingiz bilan olib keling.", "ru": "Приходите за 10 минут до занятия. Боксёрские перчатки — свои.", "en": "Arrive 10 minutes before class. Bring your own boxing gloves."}',
   'd1000000-0000-4000-8000-000000000002', 41.2756, 69.2034, '+998711000002', 'published', now(), true),
  ('e1000000-0000-4000-8000-000000000003', '0a000000-0000-4000-8000-000000000001', 'temir-gym',
   '{"uz": "Temir Gym", "ru": "Temir Gym", "en": "Temir Gym"}',
   '{"uz": "Kuch mashqlari uchun jihozlangan zal va murabbiy bilan kichik guruhlar.", "ru": "Зал для силовых тренировок и малые группы с тренером.", "en": "A strength-focused gym with coached small groups."}',
   '{"uz": "Mirzo Ulugʻbek tumani, Namuna koʻchasi, 5", "ru": "Мирзо-Улугбекский район, ул. Намуна, 5", "en": "5 Namuna Street, Mirzo Ulugbek"}',
   '{"uz": "Jihozlarni ishlatgandan keyin joyiga qoʻying.", "ru": "Возвращайте оборудование на место после использования.", "en": "Return equipment after use."}',
   'd1000000-0000-4000-8000-000000000004', 41.3264, 69.3350, null, 'published', now(), true),
  ('e1000000-0000-4000-8000-000000000004', '0a000000-0000-4000-8000-000000000001', 'zarb-boxing-club',
   '{"uz": "Zarb Boxing Club", "ru": "Zarb Boxing Club", "en": "Zarb Boxing Club"}',
   '{"uz": "Boks va kikboksing boʻyicha guruh mashgʻulotlari, boshlovchilar uchun ham.", "ru": "Групповые занятия боксом и кикбоксингом, в том числе для начинающих.", "en": "Boxing and kickboxing group classes, including beginner-friendly sessions."}',
   '{"uz": "Yakkasaroy tumani, Namuna koʻchasi, 21", "ru": "Яккасарайский район, ул. Намуна, 21", "en": "21 Namuna Street, Yakkasaray"}',
   '{"uz": "Himoya vositalari majburiy. Mashgʻulot boshlanganidan keyin kirish mumkin emas.", "ru": "Защитная экипировка обязательна. После начала занятия вход закрыт.", "en": "Protective gear is required. No entry after class starts."}',
   'd1000000-0000-4000-8000-000000000009', 41.2872, 69.2637, null, 'published', now(), true),
  ('e1000000-0000-4000-8000-000000000005', '0a000000-0000-4000-8000-000000000002', 'nafas-yoga-studio',
   '{"uz": "Nafas Yoga Studio", "ru": "Nafas Yoga Studio", "en": "Nafas Yoga Studio"}',
   '{"uz": "Tinch muhitdagi yoga studiyasi: hatha yoga va kechki choʻzilish mashgʻulotlari.", "ru": "Спокойная студия йоги: хатха-йога и вечерняя растяжка.", "en": "A calm yoga studio offering hatha yoga and evening stretch classes."}',
   '{"uz": "Mirobod tumani, Namuna koʻchasi, 8", "ru": "Мирабадский район, ул. Намуна, 8", "en": "8 Namuna Street, Mirabad"}',
   '{"uz": "Gilamchalar beriladi. Iltimos, telefoningizni ovozsiz rejimga oʻtkazing.", "ru": "Коврики предоставляются. Пожалуйста, выключите звук телефона.", "en": "Mats are provided. Please silence your phone."}',
   'd1000000-0000-4000-8000-000000000003', 41.2930, 69.2800, '+998711000005', 'published', now(), true),
  ('e1000000-0000-4000-8000-000000000006', '0a000000-0000-4000-8000-000000000002', 'ritm-dance-studio',
   '{"uz": "Ritm Dance Studio", "ru": "Ritm Dance Studio", "en": "Ritm Dance Studio"}',
   '{"uz": "Lotin raqslari va zamonaviy raqs boʻyicha kechki guruhlar.", "ru": "Вечерние группы латиноамериканских и современных танцев.", "en": "Evening groups for Latin and contemporary dance."}',
   '{"uz": "Shayxontohur tumani, Namuna koʻchasi, 17", "ru": "Шайхантахурский район, ул. Намуна, 17", "en": "17 Namuna Street, Shaykhantakhur"}',
   '{"uz": "Almashtiriladigan poyabzal kerak.", "ru": "Нужна сменная обувь.", "en": "Bring a change of shoes."}',
   'd1000000-0000-4000-8000-000000000007', 41.3230, 69.2350, null, 'published', now(), true),
  ('e1000000-0000-4000-8000-000000000007', '0a000000-0000-4000-8000-000000000002', 'chaqqon-functional-lab',
   '{"uz": "Chaqqon Functional Lab", "ru": "Chaqqon Functional Lab", "en": "Chaqqon Functional Lab"}',
   '{"uz": "Funksional tayyorgarlik, intervalli mashgʻulotlar va ochiq zal.", "ru": "Функциональная подготовка, интервальные тренировки и открытый зал.", "en": "Functional conditioning, interval classes, and open gym time."}',
   '{"uz": "Yashnobod tumani, Namuna koʻchasi, 40", "ru": "Яшнабадский район, ул. Намуна, 40", "en": "40 Namuna Street, Yashnabad"}',
   '{"uz": "Suv idishi olib keling. Kechikkanlar isinishni mustaqil bajaradi.", "ru": "Возьмите бутылку воды. Опоздавшие разминаются самостоятельно.", "en": "Bring a water bottle. Late arrivals warm up on their own."}',
   'd1000000-0000-4000-8000-000000000010', 41.2900, 69.3400, null, 'published', now(), true),
  ('e1000000-0000-4000-8000-000000000008', '0a000000-0000-4000-8000-000000000003', 'moviy-suv-aqua-center',
   '{"uz": "Moviy Suv Aqua Center", "ru": "Moviy Suv Aqua Center", "en": "Moviy Suv Aqua Center"}',
   '{"uz": "25 metrli basseyn: erkin suzish va akva-aerobika.", "ru": "25-метровый бассейн: свободное плавание и аквааэробика.", "en": "A 25-metre pool with open swim lanes and aqua aerobics."}',
   '{"uz": "Olmazor tumani, Namuna koʻchasi, 3", "ru": "Алмазарский район, ул. Намуна, 3", "en": "3 Namuna Street, Almazar"}',
   '{"uz": "Suzish qalpogʻi majburiy. Basseynga kirishdan oldin dush qabul qiling.", "ru": "Шапочка для плавания обязательна. Перед бассейном примите душ.", "en": "A swim cap is required. Shower before entering the pool."}',
   'd1000000-0000-4000-8000-000000000005', 41.3450, 69.2150, '+998711000008', 'published', now(), true),
  -- Draft venue: never published, must stay invisible to visitors and members.
  ('e1000000-0000-4000-8000-000000000009', '0a000000-0000-4000-8000-000000000001', 'yangi-kuch-gym',
   '{"uz": "Yangi Kuch Gym (qoralama)", "ru": "Yangi Kuch Gym (черновик)", "en": "Yangi Kuch Gym (draft)"}',
   '{"uz": "Tez orada ochiladi.", "ru": "Скоро открытие.", "en": "Opening soon."}',
   '{"uz": "Sergeli tumani, Namuna koʻchasi, 50", "ru": "Сергелийский район, ул. Намуна, 50", "en": "50 Namuna Street, Sergeli"}',
   '{"uz": ""}',
   'd1000000-0000-4000-8000-000000000006', 41.2270, 69.2200, null, 'draft', null, true);

insert into public.venue_categories (venue_id, category_id) values
  ('e1000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001'),
  ('e1000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000006'),
  ('e1000000-0000-4000-8000-000000000002', 'ca000000-0000-4000-8000-000000000001'),
  ('e1000000-0000-4000-8000-000000000002', 'ca000000-0000-4000-8000-000000000004'),
  ('e1000000-0000-4000-8000-000000000003', 'ca000000-0000-4000-8000-000000000001'),
  ('e1000000-0000-4000-8000-000000000004', 'ca000000-0000-4000-8000-000000000004'),
  ('e1000000-0000-4000-8000-000000000004', 'ca000000-0000-4000-8000-000000000006'),
  ('e1000000-0000-4000-8000-000000000005', 'ca000000-0000-4000-8000-000000000002'),
  ('e1000000-0000-4000-8000-000000000006', 'ca000000-0000-4000-8000-000000000005'),
  ('e1000000-0000-4000-8000-000000000006', 'ca000000-0000-4000-8000-000000000002'),
  ('e1000000-0000-4000-8000-000000000007', 'ca000000-0000-4000-8000-000000000006'),
  ('e1000000-0000-4000-8000-000000000007', 'ca000000-0000-4000-8000-000000000001'),
  ('e1000000-0000-4000-8000-000000000008', 'ca000000-0000-4000-8000-000000000003'),
  ('e1000000-0000-4000-8000-000000000009', 'ca000000-0000-4000-8000-000000000001');

insert into public.venue_amenities (venue_id, amenity_id)
select v.id, a.id
  from (values
    ('e1000000-0000-4000-8000-000000000001'::uuid, array['showers','lockers','parking','wifi','water']),
    ('e1000000-0000-4000-8000-000000000002'::uuid, array['showers','lockers','sauna','water']),
    ('e1000000-0000-4000-8000-000000000003'::uuid, array['showers','lockers','water']),
    ('e1000000-0000-4000-8000-000000000004'::uuid, array['showers','lockers','water']),
    ('e1000000-0000-4000-8000-000000000005'::uuid, array['showers','towels','wifi','water','step-free']),
    ('e1000000-0000-4000-8000-000000000006'::uuid, array['lockers','wifi','water']),
    ('e1000000-0000-4000-8000-000000000007'::uuid, array['showers','lockers','parking','water']),
    ('e1000000-0000-4000-8000-000000000008'::uuid, array['showers','lockers','towels','sauna','parking','step-free']),
    ('e1000000-0000-4000-8000-000000000009'::uuid, array['showers'])
  ) as v(id, slugs)
  join public.amenities a on a.slug = any (v.slugs);

-- Opening hours (ISO weekday, local time). Schedules below stay inside these hours.
insert into public.venue_opening_hours (venue_id, weekday, opens_at, closes_at, is_closed)
select v.id, d.weekday,
       case when d.weekday = any (v.closed_days) then null
            when d.weekday = 7 then v.sunday_open else v.opens end,
       case when d.weekday = any (v.closed_days) then null
            when d.weekday = 7 then v.sunday_close else v.closes end,
       d.weekday = any (v.closed_days)
  from (values
    ('e1000000-0000-4000-8000-000000000001'::uuid, time '07:00', time '23:00', time '09:00', time '21:00', '{}'::int[]),
    ('e1000000-0000-4000-8000-000000000002'::uuid, time '07:00', time '23:00', time '09:00', time '21:00', '{}'::int[]),
    ('e1000000-0000-4000-8000-000000000003'::uuid, time '07:00', time '22:00', time '09:00', time '20:00', '{}'::int[]),
    ('e1000000-0000-4000-8000-000000000004'::uuid, time '09:00', time '22:00', null, null, '{7}'::int[]),
    ('e1000000-0000-4000-8000-000000000005'::uuid, time '08:00', time '21:30', time '08:00', time '21:30', '{}'::int[]),
    ('e1000000-0000-4000-8000-000000000006'::uuid, time '10:00', time '22:00', null, null, '{7}'::int[]),
    ('e1000000-0000-4000-8000-000000000007'::uuid, time '07:00', time '22:00', time '07:00', time '22:00', '{}'::int[]),
    ('e1000000-0000-4000-8000-000000000008'::uuid, time '07:00', time '22:00', time '07:00', time '22:00', '{}'::int[]),
    ('e1000000-0000-4000-8000-000000000009'::uuid, time '08:00', time '22:00', time '10:00', time '20:00', '{}'::int[])
  ) as v(id, opens, closes, sunday_open, sunday_close, closed_days)
  cross join generate_series(1, 7) as d(weekday);

-- ---------------------------------------------------------------------------
-- Activities
-- ---------------------------------------------------------------------------
insert into public.activities (id, venue_id, category_id, kind, title, description, duration_minutes, default_capacity) values
  ('ac000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001', 'open_gym',
   '{"uz": "Ochiq zal", "ru": "Открытый зал", "en": "Open gym"}', '{"uz": "Trenajyor zalida erkin mashgʻulot.", "ru": "Свободная тренировка в тренажёрном зале.", "en": "Self-guided training in the gym."}', 120, 25),
  ('ac000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000006', 'class',
   '{"uz": "Funksional aylana", "ru": "Функциональный круг", "en": "Functional circuit"}', '{"uz": "Murabbiy bilan 60 daqiqalik aylana mashqlar.", "ru": "60-минутная круговая тренировка с тренером.", "en": "A 60-minute coached circuit workout."}', 60, 12),
  ('ac000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000002', 'ca000000-0000-4000-8000-000000000001', 'open_gym',
   '{"uz": "Ochiq zal", "ru": "Открытый зал", "en": "Open gym"}', '{"uz": "Trenajyor zalida erkin mashgʻulot.", "ru": "Свободная тренировка в тренажёрном зале.", "en": "Self-guided training in the gym."}', 120, 30),
  ('ac000000-0000-4000-8000-000000000004', 'e1000000-0000-4000-8000-000000000002', 'ca000000-0000-4000-8000-000000000004', 'class',
   '{"uz": "Boks asoslari", "ru": "Основы бокса", "en": "Boxing basics"}', '{"uz": "Boshlovchilar uchun texnika va harakatlar.", "ru": "Техника и передвижение для начинающих.", "en": "Technique and footwork for beginners."}', 60, 10),
  ('ac000000-0000-4000-8000-000000000005', 'e1000000-0000-4000-8000-000000000003', 'ca000000-0000-4000-8000-000000000001', 'open_gym',
   '{"uz": "Ochiq zal", "ru": "Открытый зал", "en": "Open gym"}', '{"uz": "Trenajyor zalida erkin mashgʻulot.", "ru": "Свободная тренировка в тренажёрном зале.", "en": "Self-guided training in the gym."}', 120, 20),
  ('ac000000-0000-4000-8000-000000000006', 'e1000000-0000-4000-8000-000000000003', 'ca000000-0000-4000-8000-000000000001', 'class',
   '{"uz": "Kuch mashgʻuloti", "ru": "Силовая тренировка", "en": "Strength class"}', '{"uz": "Asosiy kuch mashqlari murabbiy nazoratida.", "ru": "Базовые силовые упражнения под контролем тренера.", "en": "Foundational lifts under a coach''s supervision."}', 60, 8),
  ('ac000000-0000-4000-8000-000000000007', 'e1000000-0000-4000-8000-000000000004', 'ca000000-0000-4000-8000-000000000004', 'class',
   '{"uz": "Boks texnikasi", "ru": "Техника бокса", "en": "Boxing technique"}', '{"uz": "Zarbalar, himoya va sparring mashqlari.", "ru": "Удары, защита и упражнения в парах.", "en": "Punches, defence, and partner drills."}', 90, 12),
  ('ac000000-0000-4000-8000-000000000008', 'e1000000-0000-4000-8000-000000000004', 'ca000000-0000-4000-8000-000000000004', 'class',
   '{"uz": "Kikboksing", "ru": "Кикбоксинг", "en": "Kickboxing"}', '{"uz": "Qoʻl va oyoq zarbalari kombinatsiyalari.", "ru": "Комбинации ударов руками и ногами.", "en": "Punch and kick combinations."}', 60, 12),
  ('ac000000-0000-4000-8000-000000000009', 'e1000000-0000-4000-8000-000000000005', 'ca000000-0000-4000-8000-000000000002', 'class',
   '{"uz": "Hatha yoga", "ru": "Хатха-йога", "en": "Hatha yoga"}', '{"uz": "Barcha darajalar uchun sokin yoga mashgʻuloti.", "ru": "Спокойная практика для любого уровня.", "en": "A calm practice for all levels."}', 75, 14),
  ('ac000000-0000-4000-8000-000000000010', 'e1000000-0000-4000-8000-000000000005', 'ca000000-0000-4000-8000-000000000002', 'class',
   '{"uz": "Kechki choʻzilish", "ru": "Вечерняя растяжка", "en": "Evening stretch"}', '{"uz": "Kun oxirida mushaklarni boʻshashtirish.", "ru": "Расслабление мышц в конце дня.", "en": "Release tension at the end of the day."}', 60, 14),
  ('ac000000-0000-4000-8000-000000000011', 'e1000000-0000-4000-8000-000000000006', 'ca000000-0000-4000-8000-000000000005', 'class',
   '{"uz": "Lotin raqslari", "ru": "Латина", "en": "Latin dance"}', '{"uz": "Salsa va bachata asoslari.", "ru": "Основы сальсы и бачаты.", "en": "Salsa and bachata basics."}', 60, 16),
  ('ac000000-0000-4000-8000-000000000012', 'e1000000-0000-4000-8000-000000000006', 'ca000000-0000-4000-8000-000000000005', 'class',
   '{"uz": "Zamonaviy raqs", "ru": "Современный танец", "en": "Contemporary dance"}', '{"uz": "Erkin harakat va choreografiya.", "ru": "Свободное движение и хореография.", "en": "Free movement and choreography."}', 60, 12),
  ('ac000000-0000-4000-8000-000000000013', 'e1000000-0000-4000-8000-000000000007', 'ca000000-0000-4000-8000-000000000006', 'class',
   '{"uz": "Kross-trening", "ru": "Кросс-тренинг", "en": "Cross-training"}', '{"uz": "Intervalli yuqori intensivlikdagi mashgʻulot.", "ru": "Интервальная тренировка высокой интенсивности.", "en": "High-intensity interval training."}', 60, 12),
  ('ac000000-0000-4000-8000-000000000014', 'e1000000-0000-4000-8000-000000000007', 'ca000000-0000-4000-8000-000000000001', 'open_gym',
   '{"uz": "Ochiq zal", "ru": "Открытый зал", "en": "Open gym"}', '{"uz": "Trenajyor zalida erkin mashgʻulot.", "ru": "Свободная тренировка в тренажёрном зале.", "en": "Self-guided training in the gym."}', 120, 20),
  ('ac000000-0000-4000-8000-000000000015', 'e1000000-0000-4000-8000-000000000008', 'ca000000-0000-4000-8000-000000000003', 'open_gym',
   '{"uz": "Erkin suzish", "ru": "Свободное плавание", "en": "Open swim"}', '{"uz": "Basseyn yoʻlaklarida erkin suzish.", "ru": "Свободное плавание по дорожкам.", "en": "Lane swimming at your own pace."}', 60, 20),
  ('ac000000-0000-4000-8000-000000000016', 'e1000000-0000-4000-8000-000000000008', 'ca000000-0000-4000-8000-000000000003', 'class',
   '{"uz": "Akva-aerobika", "ru": "Аквааэробика", "en": "Aqua aerobics"}', '{"uz": "Suvdagi yengil kardio mashgʻuloti.", "ru": "Лёгкое кардио в воде.", "en": "Low-impact cardio in the water."}', 45, 15),
  ('ac000000-0000-4000-8000-000000000017', 'e1000000-0000-4000-8000-000000000009', 'ca000000-0000-4000-8000-000000000001', 'open_gym',
   '{"uz": "Ochiq zal", "ru": "Открытый зал", "en": "Open gym"}', '{"uz": ""}', 120, 20);

-- ---------------------------------------------------------------------------
-- Sessions: 3 past days and the next 14 days, relative to the seed date in Asia/Tashkent.
-- Schedule: (activity, local start times, ISO weekdays; empty = every day)
-- ---------------------------------------------------------------------------
with schedule(activity_id, starts, weekdays) as (
  values
    ('ac000000-0000-4000-8000-000000000001'::uuid, array[time '09:00', time '12:00', time '15:00', time '18:00'], '{}'::int[]),
    ('ac000000-0000-4000-8000-000000000002'::uuid, array[time '19:30'], '{}'::int[]),
    ('ac000000-0000-4000-8000-000000000002'::uuid, array[time '08:00'], '{2,4,6}'::int[]),
    ('ac000000-0000-4000-8000-000000000003'::uuid, array[time '09:00', time '12:00', time '15:00', time '18:00'], '{}'::int[]),
    ('ac000000-0000-4000-8000-000000000004'::uuid, array[time '18:30'], '{1,3,5}'::int[]),
    ('ac000000-0000-4000-8000-000000000005'::uuid, array[time '10:00', time '14:00', time '17:30'], '{}'::int[]),
    ('ac000000-0000-4000-8000-000000000006'::uuid, array[time '18:00'], '{2,4,6}'::int[]),
    ('ac000000-0000-4000-8000-000000000007'::uuid, array[time '10:00', time '19:00'], '{1,2,3,4,5,6}'::int[]),
    ('ac000000-0000-4000-8000-000000000008'::uuid, array[time '17:00'], '{2,4}'::int[]),
    ('ac000000-0000-4000-8000-000000000009'::uuid, array[time '08:30', time '18:00'], '{}'::int[]),
    ('ac000000-0000-4000-8000-000000000010'::uuid, array[time '20:00'], '{}'::int[]),
    ('ac000000-0000-4000-8000-000000000011'::uuid, array[time '19:00'], '{1,2,3,4,5,6}'::int[]),
    ('ac000000-0000-4000-8000-000000000012'::uuid, array[time '17:30'], '{2,4,6}'::int[]),
    ('ac000000-0000-4000-8000-000000000013'::uuid, array[time '07:30', time '19:00'], '{}'::int[]),
    ('ac000000-0000-4000-8000-000000000014'::uuid, array[time '10:00', time '14:00'], '{}'::int[]),
    ('ac000000-0000-4000-8000-000000000015'::uuid, array[time '07:00', time '09:00', time '12:00', time '15:00', time '18:00', time '20:00'], '{}'::int[]),
    ('ac000000-0000-4000-8000-000000000016'::uuid, array[time '11:00'], '{1,3,5}'::int[]),
    ('ac000000-0000-4000-8000-000000000017'::uuid, array[time '10:00'], '{}'::int[])
),
days as (
  select gs::date as day
    from generate_series((now() at time zone 'Asia/Tashkent')::date - 3,
                         (now() at time zone 'Asia/Tashkent')::date + 13,
                         interval '1 day') as gs
)
insert into public.sessions (venue_id, activity_id, starts_at, ends_at, capacity)
select a.venue_id, a.id,
       (d.day + st) at time zone 'Asia/Tashkent',
       ((d.day + st) at time zone 'Asia/Tashkent') + make_interval(mins => a.duration_minutes),
       a.default_capacity
  from schedule s
  join public.activities a on a.id = s.activity_id
  cross join days d
  cross join lateral unnest(s.starts) as st
 where cardinality(s.weekdays) = 0 or extract(isodow from d.day)::int = any (s.weekdays);

-- A few future sessions cancelled by the venue (demonstrates cancelled sessions).
update public.sessions s
   set status = 'cancelled', cancellation_reason = 'Demo: instructor unavailable', cancelled_at = now()
 where s.id in (
   select s2.id from public.sessions s2
    where s2.activity_id in ('ac000000-0000-4000-8000-000000000009', 'ac000000-0000-4000-8000-000000000011')
      and (s2.starts_at at time zone 'Asia/Tashkent')::date = (now() at time zone 'Asia/Tashkent')::date + 2
 );

-- ---------------------------------------------------------------------------
-- Sample plans (NOT approved commercial offers). Prices are integer tiyin: 1 UZS = 100 tiyin.
-- Start has a retired v1 to demonstrate immutable versions.
-- ---------------------------------------------------------------------------
insert into public.plans (id, code, sort_order) values
  ('b1000000-0000-4000-8000-000000000001', 'start', 1),
  ('b1000000-0000-4000-8000-000000000002', 'active', 2),
  ('b1000000-0000-4000-8000-000000000003', 'max', 3);

insert into public.plan_versions (id, plan_id, version, status, name, description, price_minor, duration_days,
                                  visit_allowance, is_demo, published_at) values
  ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 1, 'draft',
   '{"uz": "Start", "ru": "Start", "en": "Start"}',
   '{"uz": "Tanlangan demo maskanlarda oyiga 8 ta tashrif.", "ru": "8 посещений в месяц в выбранных демо-залах.", "en": "8 visits a month at selected demo venues."}',
   27900000, 30, 8, true, null),
  ('b2000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 2, 'draft',
   '{"uz": "Start", "ru": "Start", "en": "Start"}',
   '{"uz": "Tanlangan demo maskanlarda oyiga 8 ta tashrif.", "ru": "8 посещений в месяц в выбранных демо-залах.", "en": "8 visits a month at selected demo venues."}',
   29900000, 30, 8, true, null),
  ('b2000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000002', 1, 'draft',
   '{"uz": "Active", "ru": "Active", "en": "Active"}',
   '{"uz": "Kengroq demo maskanlar tanlovida oyiga 16 ta tashrif.", "ru": "16 посещений в месяц в расширенной подборке демо-залов.", "en": "16 visits a month across a broader selection of demo venues."}',
   49900000, 30, 16, true, null),
  ('b2000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000003', 1, 'draft',
   '{"uz": "Max", "ru": "Max", "en": "Max"}',
   '{"uz": "Barcha demo maskanlarda oyiga 30 ta tashrif.", "ru": "30 посещений в месяц во всех демо-залах.", "en": "30 visits a month at every eligible demo venue."}',
   69900000, 30, 30, true, null);

insert into public.plan_version_venues (plan_version_id, venue_id)
select pv.id, v.id
  from (values
    ('b2000000-0000-4000-8000-000000000001'::uuid, array[1, 3, 5]),
    ('b2000000-0000-4000-8000-000000000002'::uuid, array[1, 3, 5, 7]),
    ('b2000000-0000-4000-8000-000000000003'::uuid, array[1, 2, 3, 5, 6, 7]),
    ('b2000000-0000-4000-8000-000000000004'::uuid, array[1, 2, 3, 4, 5, 6, 7, 8])
  ) as pv(id, venue_numbers)
  cross join lateral unnest(pv.venue_numbers) as n
  join public.venues v on v.id = ('e1000000-0000-4000-8000-00000000000' || n)::uuid;

-- Publish after the eligibility mapping is complete (published versions are immutable).
update public.plan_versions set status = 'published', published_at = now() - interval '60 days'
 where id = 'b2000000-0000-4000-8000-000000000001';
update public.plan_versions set status = 'retired', retired_at = now() - interval '20 days'
 where id = 'b2000000-0000-4000-8000-000000000001';
update public.plan_versions set status = 'published', published_at = now() - interval '20 days'
 where id in ('b2000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000003',
              'b2000000-0000-4000-8000-000000000004');
