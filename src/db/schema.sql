-- ====================================================================
-- SDIP OOH PROMO HUB — PRODUCTION RELATIONAL DATABASE SCHEMA (PostgreSQL)
-- LAYER: Database (DDL Specifications & Schema Definition)
-- COMPLIANCE: Spatial Decision Intelligence Platform Standard
-- ====================================================================

-- Enable UUID extension if required
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --------------------------------------------------------------------
-- 1. TABLE: suppliers (Справочник поставщиков наружной рекламы)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    folder_path VARCHAR(255) NOT NULL,
    inn VARCHAR(32),
    contact_email VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE suppliers IS 'Реестр поставщиков OOH конструкций и корневых папок архивации';
COMMENT ON COLUMN suppliers.folder_path IS 'Корневой префикс папки поставщика на файловом сервере (/storage/{folder_path}/)';

-- --------------------------------------------------------------------
-- 2. TABLE: users (Пользователи Telegram Web App: КАМ и Специалисты)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(128),
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL CHECK (role IN ('KAM', 'Specialist', 'Admin')),
    supplier_id VARCHAR(64) REFERENCES suppliers(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_supplier ON users(supplier_id);

COMMENT ON TABLE users IS 'Учетные записи операторов Telegram Web App с жестким RBAC разделением';

-- --------------------------------------------------------------------
-- 3. TABLE: constructions (ТЗ и адресная программа КАМ)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS constructions (
    id VARCHAR(64) PRIMARY KEY,
    supplier_id VARCHAR(64) NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    code VARCHAR(64) NOT NULL,
    type VARCHAR(64) NOT NULL, -- Щит 3х6, Ситиборд, Суперсайт, Индор
    side VARCHAR(64) NOT NULL, -- Сторона А, Сторона Б
    address_location TEXT NOT NULL,
    latitude NUMERIC(10, 6) NOT NULL,
    longitude NUMERIC(10, 6) NOT NULL,
    tolerance_meters INT DEFAULT 300 NOT NULL,
    ai_criteria TEXT NOT NULL, -- Текстовое ТЗ и критерии качества от КАМа
    reference_photo_url TEXT, -- Ссылка на эталонное фото из ZIP-архива
    month_period VARCHAR(7) NOT NULL, -- YYYY-MM
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_supplier_construction_month UNIQUE (supplier_id, code, side, month_period)
);

CREATE INDEX IF NOT EXISTS idx_constructions_supplier ON constructions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_constructions_code ON constructions(code);
CREATE INDEX IF NOT EXISTS idx_constructions_coords ON constructions(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_constructions_month ON constructions(month_period);

COMMENT ON TABLE constructions IS 'Эталонные адресные программы от КАМа с координатами и критериями ИИ';

-- --------------------------------------------------------------------
-- 4. TABLE: reports (Фактические отчеты полевых специалистов)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
    id VARCHAR(64) PRIMARY KEY,
    construction_id VARCHAR(64) NOT NULL REFERENCES constructions(id) ON DELETE RESTRICT,
    specialist_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    supplier_id VARCHAR(64) NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL, -- Чистовой файл со штампом в структуре /storage/{folder_path}/{YYYY-MM}/
    raw_photo_url TEXT, -- Исходный неотредактированный снимок с камеры
    gps_lat NUMERIC(10, 6) NOT NULL,
    gps_lon NUMERIC(10, 6) NOT NULL,
    geo_distance_meters INT, -- Вычисленное отклонение от эталонной точки
    status VARCHAR(32) NOT NULL CHECK (status IN ('APPROVED', 'REJECTED', 'PENDING')),
    confidence_score NUMERIC(4, 3) NOT NULL, -- Оценка уверенности ИИ-модели (0.000 - 1.000)
    ai_reasoning TEXT NOT NULL, -- Обоснование ИИ-инспектора для полевого специалиста
    detected_issues JSONB DEFAULT '[]'::jsonb NOT NULL, -- Список зафиксированных дефектов
    stamp_hash VARCHAR(128) NOT NULL, -- Криптографический хэш штампа водяных знаков
    capture_source VARCHAR(64) DEFAULT 'live_camera_stream' NOT NULL,
    captured_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_construction ON reports(construction_id);
CREATE INDEX IF NOT EXISTS idx_reports_specialist ON reports(specialist_id);
CREATE INDEX IF NOT EXISTS idx_reports_supplier ON reports(supplier_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_captured_at ON reports(captured_at);

COMMENT ON TABLE reports IS 'Фактические полевые отчеты с метаданными ИИ-проверки и геолокации';
