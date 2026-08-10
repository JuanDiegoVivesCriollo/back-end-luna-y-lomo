CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash CHAR(64) NOT NULL,
  password_salt CHAR(32) NOT NULL,
  role ENUM('cliente','personal','administrador') NOT NULL DEFAULT 'cliente',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY users_email_unique (email),
  KEY users_role_idx (role)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sessions (
  id CHAR(96) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY sessions_user_idx (user_id),
  KEY sessions_expires_idx (expires_at),
  CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  species ENUM('perro','gato','otro') NOT NULL,
  breed VARCHAR(120) NULL,
  birth_date DATE NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY pets_owner_idx (owner_id),
  CONSTRAINT pets_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS appointments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_id BIGINT UNSIGNED NULL,
  pet_id BIGINT UNSIGNED NULL,
  owner_name VARCHAR(120) NOT NULL,
  pet_name VARCHAR(100) NOT NULL,
  pet_type ENUM('perro','gato','otro') NOT NULL,
  reason VARCHAR(180) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  preferred_date DATE NOT NULL,
  status ENUM('solicitada','confirmada','completada','cancelada') NOT NULL DEFAULT 'solicitada',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY appointments_date_status_idx (preferred_date,status),
  CONSTRAINT appointments_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT appointments_pet_fk FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(160) NOT NULL,
  name VARCHAR(160) NOT NULL,
  category VARCHAR(80) NOT NULL,
  short_description VARCHAR(240) NOT NULL,
  description TEXT NOT NULL,
  features_json LONGTEXT NULL,
  price_pen DECIMAL(10,2) UNSIGNED NOT NULL,
  stock INT UNSIGNED NOT NULL DEFAULT 0,
  image_url VARCHAR(500) NOT NULL,
  image_alt VARCHAR(220) NOT NULL,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY products_slug_unique (slug),
  KEY products_active_category_idx (active,category),
  KEY products_featured_sort_idx (featured,sort_order)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS services (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(160) NOT NULL,
  name VARCHAR(160) NOT NULL,
  eyebrow VARCHAR(90) NOT NULL,
  short_description VARCHAR(260) NOT NULL,
  description TEXT NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  image_alt VARCHAR(220) NOT NULL,
  duration_label VARCHAR(100) NULL,
  cta_label VARCHAR(100) NOT NULL DEFAULT 'Reservar atención',
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  emergency BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY services_slug_unique (slug),
  KEY services_active_sort_idx (active,sort_order),
  KEY services_featured_idx (featured)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS specialties (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(160) NOT NULL,
  name VARCHAR(160) NOT NULL,
  short_description VARCHAR(260) NOT NULL,
  description TEXT NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  image_alt VARCHAR(220) NOT NULL,
  availability VARCHAR(120) NULL,
  whatsapp_text VARCHAR(400) NOT NULL,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY specialties_slug_unique (slug),
  KEY specialties_active_sort_idx (active,sort_order),
  KEY specialties_featured_idx (featured)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS site_settings (
  setting_key VARCHAR(100) NOT NULL,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS uploaded_files (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  relative_url VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  uploaded_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uploaded_files_url_unique (relative_url),
  KEY uploaded_files_user_idx (uploaded_by),
  CONSTRAINT uploaded_files_user_fk FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS schema_meta (
  meta_key VARCHAR(100) NOT NULL,
  meta_value VARCHAR(255) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (meta_key)
) ENGINE=InnoDB;

-- SEED DATA

INSERT INTO products
  (slug,name,category,short_description,description,features_json,price_pen,stock,image_url,image_alt,featured,active,sort_order)
VALUES
  ('bruma-de-calma','Spray calmante ambiental','Bienestar','Ayuda a crear un ambiente más tranquilo durante viajes, mudanzas o ruidos fuertes.','Spray ambiental para perros y gatos que puede aplicarse en mantas, transportadoras y zonas de descanso. No se aplica directamente sobre la mascota.','["100 ml","Uso en ambientes","Para perros y gatos","No aplicar directamente sobre la mascota"]',79.90,24,'/uploads/products/bruma-calma.png','Spray calmante ambiental en envase coral',TRUE,TRUE,1),
  ('bocados-raiz','Premios de pavo y calabaza','Snacks','Premios horneados y pequeños para entrenamiento o refuerzo positivo.','Premios suaves elaborados con pavo y calabaza, sin colorantes artificiales. Su tamaño permite usarlos durante el entrenamiento sin reemplazar la alimentación diaria.','["180 g","Pavo y calabaza","Sin colorantes artificiales","Tamaño pequeño"]',34.90,35,'/uploads/products/bocados-raiz.png','Bolsa verde de premios horneados para mascotas',TRUE,TRUE,2),
  ('balsamo-nube','Bálsamo para almohadillas','Cuidado de la piel','Ayuda a proteger e hidratar las almohadillas y zonas de roce.','Bálsamo de uso externo con caléndula y ceras vegetales. Ayuda a mantener suaves las almohadillas expuestas al calor, superficies ásperas o caminatas frecuentes.','["50 g","Con caléndula","Rápida absorción","Uso externo"]',49.90,18,'/uploads/products/balsamo-nube.png','Frasco ámbar de bálsamo para almohadillas',TRUE,TRUE,3),
  ('kit-primera-siesta','Kit de bienvenida para mascotas','Nuevo en casa','Artículos básicos para los primeros días de tu mascota en casa.','Incluye una manta lavable, un juguete, un cepillo suave y una guía con recomendaciones para facilitar la adaptación durante los primeros días.','["Manta lavable","Juguete","Cepillo suave","Guía de adaptación"]',129.90,12,'/uploads/products/kit-bienvenida.png','Kit de bienvenida para mascotas en caja verde',TRUE,TRUE,4)
ON DUPLICATE KEY UPDATE
  name=VALUES(name), category=VALUES(category), short_description=VALUES(short_description),
  description=VALUES(description), features_json=VALUES(features_json), price_pen=VALUES(price_pen),
  stock=VALUES(stock), image_url=VALUES(image_url), image_alt=VALUES(image_alt),
  featured=VALUES(featured), active=VALUES(active), sort_order=VALUES(sort_order);

INSERT INTO services
  (slug,name,eyebrow,short_description,description,image_url,image_alt,duration_label,cta_label,featured,emergency,active,sort_order)
VALUES
  ('consulta-general','Consulta general','Consulta y evaluación','Revisión completa para saber qué le sucede a tu mascota y qué tratamiento necesita.','Conversamos contigo, revisamos a tu mascota de cabeza a cola y te explicamos lo que encontramos. La consulta incluye indicaciones, tratamiento y seguimiento cuando sea necesario.','https://images.unsplash.com/photo-1576201836106-db1758fd1c97?auto=format&fit=crop&q=86&w=1400','Médica veterinaria examinando a un perro','45 minutos','Reservar una cita',TRUE,FALSE,TRUE,1),
  ('emergencias-24-7','Emergencias 24 horas','Atención inmediata','Evaluación y estabilización rápida para mascotas que necesitan atención urgente.','Atendemos urgencias y emergencias durante todo el día. Primero evaluamos el estado de tu mascota, controlamos el dolor y coordinamos los exámenes o procedimientos necesarios.','https://images.unsplash.com/photo-1628009368231-7bb7cfcb0def?auto=format&fit=crop&q=86&w=1400','Atención veterinaria de emergencia para un perro','Atención 24 horas','Llamar ahora',TRUE,TRUE,TRUE,2),
  ('vacunacion','Vacunación','Prevención','Vacunas según la edad, especie, estilo de vida y antecedentes de tu mascota.','Preparamos calendarios de vacunación para cachorros, adultos y mascotas mayores. Antes de vacunar hacemos una revisión clínica y te explicamos los posibles efectos y cuidados posteriores.','https://images.unsplash.com/photo-1583337130417-3346a1be7dee?auto=format&fit=crop&q=86&w=1400','Perro recibiendo cuidado preventivo','20–30 minutos','Reservar vacunación',TRUE,FALSE,TRUE,3),
  ('cirugia','Cirugía','Cirugía y recuperación','Procedimientos seguros con monitoreo permanente y control del dolor.','Realizamos cirugías programadas con evaluación previa, anestesia monitoreada, control del dolor y seguimiento después del alta. Antes del procedimiento te explicamos los riesgos, cuidados y costos.','https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&q=86&w=1400','Equipo veterinario preparando una cirugía','Según evaluación','Solicitar evaluación',TRUE,FALSE,TRUE,4),
  ('laboratorio-clinico','Laboratorio clínico','Exámenes de laboratorio','Análisis de sangre, orina y otras muestras para obtener un diagnóstico preciso.','Realizamos análisis de sangre, orina y pruebas complementarias. El veterinario revisa los resultados contigo y te explica cómo influyen en el diagnóstico y el tratamiento.','https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&q=86&w=1400','Profesional trabajando con muestras en laboratorio','Tiempo según el examen','Consultar disponibilidad',FALSE,FALSE,TRUE,5),
  ('radiografia-ecografia','Radiografía y ecografía','Diagnóstico por imágenes','Imágenes digitales para revisar órganos, huesos, articulaciones y tejidos.','Contamos con radiografía digital y ecografía para evaluar el tórax, abdomen, huesos, articulaciones y otras estructuras. Los resultados se interpretan junto con la revisión clínica.','https://images.unsplash.com/photo-1580281658628-52626f4fd1b4?auto=format&fit=crop&q=86&w=1400','Equipo clínico revisando estudios diagnósticos','Con cita o por emergencia','Reservar un examen',FALSE,FALSE,TRUE,6),
  ('internamiento','Hospitalización','Cuidado hospitalario','Observación, medicación y reportes sobre la evolución de tu mascota.','Las mascotas que necesitan observación o tratamiento continuo permanecen en ambientes separados y reciben controles frecuentes, alimentación indicada y medicación. Te mantendremos informado sobre su evolución.','https://images.unsplash.com/photo-1599443015574-be5fe8a05783?auto=format&fit=crop&q=86&w=1400','Paciente canino bajo observación veterinaria','Monitoreo continuo','Hablar con el equipo',FALSE,FALSE,TRUE,7),
  ('peluqueria-canina','Peluquería canina','Baño y corte','Baño y corte según el pelaje, la piel y el comportamiento de tu perro.','Antes de empezar revisamos la piel y los oídos. Usamos productos adecuados para cada tipo de pelaje y hacemos pausas si tu perro se muestra incómodo o nervioso.','https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&q=86&w=1400','Perro tranquilo durante una sesión de peluquería','Según tamaño y pelaje','Reservar peluquería',FALSE,FALSE,TRUE,8),
  ('odontologia','Odontología','Salud dental','Revisión, limpieza dental y tratamiento de problemas en dientes y encías.','Revisamos dientes, encías, mal aliento y señales de dolor. Si necesita limpieza o extracción, te explicamos la anestesia, el procedimiento y los cuidados en casa.','https://images.unsplash.com/photo-1601758228041-f3b2795255f1?auto=format&fit=crop&q=86&w=1400','Revisión clínica de un paciente canino','Evaluación previa','Reservar evaluación',FALSE,FALSE,TRUE,9),
  ('farmacia-veterinaria','Farmacia veterinaria','Medicamentos y tratamientos','Medicamentos y productos indicados por profesionales veterinarios.','Entregamos los medicamentos recetados y te explicamos la dosis, los horarios y la forma correcta de guardarlos. También podemos ayudarte a elegir una presentación más fácil de administrar.','https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&q=86&w=1400','Productos de farmacia organizados','Atención en la clínica','Consultar un producto',FALSE,FALSE,TRUE,10)
ON DUPLICATE KEY UPDATE
  name=VALUES(name), eyebrow=VALUES(eyebrow), short_description=VALUES(short_description),
  description=VALUES(description), image_url=VALUES(image_url), image_alt=VALUES(image_alt),
  duration_label=VALUES(duration_label), cta_label=VALUES(cta_label), featured=VALUES(featured),
  emergency=VALUES(emergency), active=VALUES(active), sort_order=VALUES(sort_order);

INSERT INTO specialties
  (slug,name,short_description,description,image_url,image_alt,availability,whatsapp_text,featured,active,sort_order)
VALUES
  ('oftalmologia','Oftalmología','Evaluación de los ojos, párpados, córnea y visión.','Diagnosticamos y damos seguimiento a irritaciones, úlceras, presión ocular y otros problemas que pueden afectar la visión de tu mascota.','https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?auto=format&fit=crop&q=86&w=1400','Primer plano de un perro durante evaluación ocular','Con cita','Hola, quisiera reservar una cita de Oftalmología para mi mascota.',TRUE,TRUE,1),
  ('dermatologia','Dermatología','Atención de problemas en la piel, oídos, pelo y alergias.','Evaluamos picazón, infecciones de oído frecuentes, caída de pelo, infecciones y alergias para elegir un tratamiento que también considere el ambiente y la alimentación.','https://images.unsplash.com/photo-1558788353-f76d92427f16?auto=format&fit=crop&q=86&w=1400','Piel y pelaje saludable de un perro','Con cita','Hola, quisiera reservar una cita de Dermatología para mi mascota.',TRUE,TRUE,2),
  ('neurologia','Neurología','Evaluación del sistema nervioso, el movimiento y la coordinación.','Atendemos convulsiones, debilidad, problemas de equilibrio, dolor en la columna y otros cambios neurológicos mediante una revisión especializada y exámenes complementarios.','https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&q=86&w=1400','Paciente canino en consulta especializada','Según programación','Hola, quisiera reservar una cita de Neurología para mi mascota.',TRUE,TRUE,3),
  ('fisioterapia-rehabilitacion','Fisioterapia y rehabilitación','Terapias para recuperar movilidad y fuerza después de una lesión o cirugía.','Preparamos planes personalizados para mascotas con lesiones, dolor crónico o dificultad para moverse. También te enseñamos ejercicios sencillos para continuar la recuperación en casa.','https://images.unsplash.com/photo-1601758174114-e711c0cbaa69?auto=format&fit=crop&q=86&w=1400','Perro realizando actividad de rehabilitación','Con evaluación previa','Hola, quisiera reservar una evaluación de Fisioterapia y rehabilitación para mi mascota.',TRUE,TRUE,4),
  ('traumatologia','Traumatología','Atención de huesos, articulaciones, ligamentos y músculos.','Evaluamos cojeras, fracturas, lesiones de ligamentos y problemas articulares para definir si necesita medicamentos, rehabilitación o cirugía.','https://images.unsplash.com/photo-1560743641-3914f2c45636?auto=format&fit=crop&q=86&w=1400','Perro caminando durante una evaluación traumatológica','Con cita','Hola, quisiera reservar una cita de Traumatología para mi mascota.',FALSE,TRUE,5),
  ('cardiologia','Cardiología','Evaluación del corazón y la circulación.','Atendemos soplos, tos, cansancio, desmayos y controles de mascotas con enfermedades cardíacas. Cuando se requiere, realizamos ecocardiograma y electrocardiograma.','https://images.unsplash.com/photo-1525253086316-d0c936c814f8?auto=format&fit=crop&q=86&w=1400','Perro adulto en control de cardiología','En la sede de San Martín de Porres','Hola, quisiera reservar una cita de Cardiología para mi mascota.',TRUE,TRUE,6),
  ('neumologia','Neumología','Evaluación de la respiración, las vías respiratorias y los pulmones.','Atendemos tos persistente, dificultad para respirar, ruidos anormales y otros problemas respiratorios con una revisión clínica y exámenes por imágenes.','https://images.unsplash.com/photo-1587300003388-59208cc962cb?auto=format&fit=crop&q=86&w=1400','Perro en evaluación respiratoria','Según programación','Hola, quisiera reservar una cita de Neumología para mi mascota.',FALSE,TRUE,7),
  ('animales-exoticos','Animales exóticos','Atención veterinaria para conejos, aves y pequeños mamíferos.','Realizamos consultas adaptadas a cada especie y te orientamos sobre alimentación, ambiente, prevención y señales de enfermedad que necesitan atención.','https://images.unsplash.com/photo-1585110396000-c9ffd4e4b308?auto=format&fit=crop&q=86&w=1400','Conejo atendido como animal exótico','Con cita','Hola, quisiera reservar una cita para mi mascota exótica.',TRUE,TRUE,8),
  ('medicina-interna','Medicina interna','Evaluación de problemas complejos o de varios órganos.','Revisamos los antecedentes, la consulta, los análisis y las imágenes para estudiar enfermedades digestivas, hormonales, urinarias o que afectan varios órganos.','https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&q=86&w=1400','Médico veterinario en consulta de medicina interna','Con cita','Hola, quisiera reservar una cita de Medicina interna para mi mascota.',FALSE,TRUE,9)
ON DUPLICATE KEY UPDATE
  name=VALUES(name), short_description=VALUES(short_description), description=VALUES(description),
  image_url=VALUES(image_url), image_alt=VALUES(image_alt), availability=VALUES(availability),
  whatsapp_text=VALUES(whatsapp_text), featured=VALUES(featured), active=VALUES(active), sort_order=VALUES(sort_order);

INSERT INTO site_settings (setting_key,setting_value)
VALUES
  ('clinic_name','Luna & Lomo'),
  ('legal_name','Luna & Lomo Veterinaria E.I.R.L.'),
  ('phone_display','+51 997 528 278'),
  ('phone_href','+51997528278'),
  ('whatsapp_number','51997528278'),
  ('email','hola@lunaylomo.pe'),
  ('address','Av. Santísima Cruz de San Diego, Mz. V Lt. 1 N.° 389 A, Urb. Pro 7.° sector, San Martín de Porres, Lima'),
  ('maps_url','https://www.google.com/maps/search/?api=1&query=Cl%C3%ADnica+Veterinaria+Zoolopatas+San+Mart%C3%ADn+de+Porres+Lima'),
  ('hours_week','Lun–Sáb · 8:00 a. m.–8:00 p. m.'),
  ('hours_emergency','Emergencias · 24 horas'),
  ('instagram_url','https://instagram.com'),
  ('currency','PEN')
ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value);
