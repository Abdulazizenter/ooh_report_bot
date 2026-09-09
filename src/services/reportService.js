import { reportRepository } from '../repositories/reportRepository.js';

class ReportService {
  constructor(repository = reportRepository) {
    this.repository = repository;
  }

  getOrderedReports(filters = {}) {
    let reports = this.repository.getAllReports();

    // Filter by contractor if specified
    if (filters.contractorId) {
      reports = reports.filter(r => r.contractor?.id === filters.contractorId || r.contractor?.name?.toLowerCase().includes(filters.contractorId.toLowerCase()));
    }

    // Filter by city / location
    if (filters.city) {
      reports = reports.filter(r => r.location?.city?.toLowerCase() === filters.city.toLowerCase());
    }

    // Filter by construction type or code
    if (filters.constructionCode) {
      reports = reports.filter(r => r.construction?.code?.toLowerCase().includes(filters.constructionCode.toLowerCase()));
    }

    // Filter by status
    if (filters.status) {
      reports = reports.filter(r => r.status === filters.status);
    }

    // Search query across contractor, address, construction code, campaign
    if (filters.search) {
      const q = filters.search.toLowerCase().trim();
      reports = reports.filter(r =>
        r.contractor?.name?.toLowerCase().includes(q) ||
        r.contractor?.representative?.toLowerCase().includes(q) ||
        r.location?.address?.toLowerCase().includes(q) ||
        r.location?.city?.toLowerCase().includes(q) ||
        r.construction?.code?.toLowerCase().includes(q) ||
        r.construction?.type?.toLowerCase().includes(q) ||
        r.campaignName?.toLowerCase().includes(q)
      );
    }

    // Sort order:
    // User requirement: "сохранятся по порядку то есть поставщик локация конструкция дата и время"
    if (filters.sortBy === 'contractor_hierarchy') {
      reports.sort((a, b) => {
        // 1. Поставщик
        const compContractor = (a.contractor?.name || '').localeCompare(b.contractor?.name || '', 'ru');
        if (compContractor !== 0) return compContractor;

        // 2. Локация
        const locA = `${a.location?.city || ''} ${a.location?.address || ''}`;
        const locB = `${b.location?.city || ''} ${b.location?.address || ''}`;
        const compLocation = locA.localeCompare(locB, 'ru');
        if (compLocation !== 0) return compLocation;

        // 3. Конструкция
        const compConstruction = (a.construction?.code || '').localeCompare(b.construction?.code || '', 'ru');
        if (compConstruction !== 0) return compConstruction;

        // 4. Дата и время (newest first within same construction)
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
    } else {
      // Default: Latest timestamp first, maintaining the 4 core fields in each record
      reports.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    return reports;
  }

  createReport(data) {
    if (!data.contractor || !data.contractor.name) {
      throw new Error('Поле "Поставщик" (Подрядчик) обязательно для заполнения');
    }
    if (!data.location || !data.location.address) {
      throw new Error('Поле "Локация" (Адрес) обязательно для заполнения');
    }
    if (!data.construction || !data.construction.code) {
      throw new Error('Поле "Конструкция" (Код или тип) обязательно для заполнения');
    }

    const now = new Date();
    const timestamp = data.timestamp || now.toISOString();
    const eventDate = new Date(timestamp);

    const pad = (n) => String(n).padStart(2, '0');
    const displayDate = `${pad(eventDate.getDate())}.${pad(eventDate.getMonth() + 1)}.${eventDate.getFullYear()}`;
    const displayTime = `${pad(eventDate.getHours())}:${pad(eventDate.getMinutes())}:${pad(eventDate.getSeconds())}`;

    // Structure strictly complying with user requirement:
    // 1. Поставщик, 2. Локация, 3. Конструкция, 4. Дата и время
    const newReport = {
      id: `rep_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      // 1. Поставщик
      contractor: {
        id: data.contractor.id || `cnt_${Date.now()}`,
        name: data.contractor.name.trim(),
        inn: data.contractor.inn ? data.contractor.inn.trim() : '',
        representative: data.contractor.representative ? data.contractor.representative.trim() : 'Представитель подрядчика',
        phone: data.contractor.phone || '',
        telegramUser: data.contractor.telegramUser || ''
      },
      // 2. Локация
      location: {
        city: data.location.city ? data.location.city.trim() : 'Москва',
        district: data.location.district ? data.location.district.trim() : '',
        address: data.location.address.trim(),
        landmark: data.location.landmark ? data.location.landmark.trim() : '',
        latitude: typeof data.location.latitude === 'number' ? data.location.latitude : null,
        longitude: typeof data.location.longitude === 'number' ? data.location.longitude : null,
        geoAccuracyMeters: data.location.geoAccuracyMeters || null
      },
      // 3. Конструкция
      construction: {
        code: data.construction.code.trim().toUpperCase(),
        type: data.construction.type ? data.construction.type.trim() : 'Билборд 3х6 м',
        side: data.construction.side ? data.construction.side.trim() : 'Сторона А',
        formatSize: data.construction.formatSize || '3.0 x 6.0 м',
        lightingType: data.construction.lightingType || 'Внешняя подсветка'
      },
      // 4. Дата и время
      timestamp: timestamp,
      displayDate: displayDate,
      displayTime: displayTime,

      // Дополнительные параметры верификации OOH
      campaignName: data.campaignName ? data.campaignName.trim() : 'Рекламная кампания',
      status: data.status || 'mounted',
      defectDetails: data.defectDetails ? data.defectDetails.trim() : '',
      photos: Array.isArray(data.photos) ? data.photos : (data.photo ? [data.photo] : []),
      verificationStatus: 'pending',
      notes: data.notes ? data.notes.trim() : '',
      source: data.source || 'telegram_web_app'
    };

    return this.repository.addReport(newReport);
  }

  getReportById(id) {
    return this.repository.getReportById(id);
  }

  updateReport(id, data, requestingUser = null) {
    const existing = this.repository.getReportById(id);
    if (!existing) {
      throw new Error(`Отчет с ID "${id}" не найден`);
    }

    // Role check: admin has full permission to edit any value; contractor can only edit own report
    const isAdmin = requestingUser?.role === 'admin' || !requestingUser; // default permissive if internal
    if (!isAdmin && requestingUser?.contractorId && existing.contractor?.id !== requestingUser.contractorId) {
      throw new Error('Доступ запрещен: Вы можете редактировать только отчеты своей организации');
    }

    const updatePayload = {};

    // 1. Поставщик
    if (data.contractor) {
      updatePayload.contractor = {
        ...existing.contractor,
        name: data.contractor.name !== undefined ? data.contractor.name.trim() : existing.contractor.name,
        inn: data.contractor.inn !== undefined ? data.contractor.inn.trim() : existing.contractor.inn,
        representative: data.contractor.representative !== undefined ? data.contractor.representative.trim() : existing.contractor.representative,
        phone: data.contractor.phone !== undefined ? data.contractor.phone.trim() : existing.contractor.phone,
        telegramUser: data.contractor.telegramUser !== undefined ? data.contractor.telegramUser.trim() : existing.contractor.telegramUser
      };
    }

    // 2. Локация
    if (data.location) {
      updatePayload.location = {
        ...existing.location,
        city: data.location.city !== undefined ? data.location.city.trim() : existing.location.city,
        address: data.location.address !== undefined ? data.location.address.trim() : existing.location.address,
        landmark: data.location.landmark !== undefined ? data.location.landmark.trim() : existing.location.landmark,
        latitude: typeof data.location.latitude === 'number' ? data.location.latitude : existing.location.latitude,
        longitude: typeof data.location.longitude === 'number' ? data.location.longitude : existing.location.longitude,
        geoAccuracyMeters: data.location.geoAccuracyMeters !== undefined ? data.location.geoAccuracyMeters : existing.location.geoAccuracyMeters
      };
    }

    // 3. Конструкция
    if (data.construction) {
      updatePayload.construction = {
        ...existing.construction,
        code: data.construction.code !== undefined ? data.construction.code.trim().toUpperCase() : existing.construction.code,
        type: data.construction.type !== undefined ? data.construction.type.trim() : existing.construction.type,
        side: data.construction.side !== undefined ? data.construction.side.trim() : existing.construction.side,
        formatSize: data.construction.formatSize !== undefined ? data.construction.formatSize.trim() : existing.construction.formatSize,
        lightingType: data.construction.lightingType !== undefined ? data.construction.lightingType.trim() : existing.construction.lightingType
      };
    }

    // 4. Дата и время
    if (data.timestamp || data.displayDate || data.displayTime) {
      if (data.timestamp) {
        updatePayload.timestamp = data.timestamp;
        const d = new Date(data.timestamp);
        if (!isNaN(d.getTime())) {
          const pad = (n) => String(n).padStart(2, '0');
          updatePayload.displayDate = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
          updatePayload.displayTime = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        }
      }
      if (data.displayDate) updatePayload.displayDate = data.displayDate;
      if (data.displayTime) updatePayload.displayTime = data.displayTime;
    }

    // Operational audit fields
    if (data.campaignName !== undefined) updatePayload.campaignName = data.campaignName.trim();
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.defectDetails !== undefined) updatePayload.defectDetails = data.defectDetails.trim();
    if (data.verificationStatus !== undefined) updatePayload.verificationStatus = data.verificationStatus;
    if (data.notes !== undefined) updatePayload.notes = data.notes.trim();
    if (data.photos && Array.isArray(data.photos)) updatePayload.photos = data.photos;

    // Track auditor if admin updated
    if (isAdmin && requestingUser?.name) {
      updatePayload.lastEditedBy = `${requestingUser.name} (${new Date().toLocaleTimeString('ru-RU')})`;
    }

    return this.repository.updateReport(id, updatePayload);
  }

  verifyReport(id, verificationStatus, notes = '', auditor = 'Главный Администратор OOH') {
    const existing = this.repository.getReportById(id);
    if (!existing) {
      throw new Error(`Отчет "${id}" не найден`);
    }

    const payload = {
      verificationStatus,
      verifiedBy: auditor,
      verificationTimestamp: new Date().toISOString()
    };
    if (notes) {
      payload.notes = (existing.notes ? existing.notes + ' | ' : '') + `[Аудит]: ${notes}`;
    }

    return this.repository.updateReport(id, payload);
  }

  // User and Profile Management
  getUsers() {
    const users = this.repository.getAllUsers();
    const reports = this.repository.getAllReports();

    // Enrich each user with real-time reporting statistics
    return users.map(user => {
      const userReports = user.role === 'admin'
        ? reports
        : reports.filter(r => r.contractor?.id === user.contractorId || r.contractor?.name?.toLowerCase().includes((user.organization || '').toLowerCase()));

      const verifiedCount = userReports.filter(r => r.verificationStatus === 'verified').length;
      const defectCount = userReports.filter(r => r.status === 'defect_reported').length;
      const pendingCount = userReports.filter(r => r.verificationStatus === 'pending').length;

      return {
        ...user,
        stats: {
          totalReports: userReports.length,
          verifiedReports: verifiedCount,
          defectReports: defectCount,
          pendingReports: pendingCount
        }
      };
    });
  }

  getUserById(id) {
    const users = this.getUsers();
    return users.find(u => u.id === id || u.username === id) || null;
  }

  updateUser(id, data, requestingUser = null) {
    const user = this.repository.getUserById(id);
    if (!user) {
      throw new Error(`Пользователь с ID "${id}" не найден`);
    }

    const isAdmin = requestingUser?.role === 'admin' || !requestingUser;
    const isSelf = requestingUser?.id === id || requestingUser?.username === id;

    if (!isAdmin && !isSelf) {
      throw new Error('Доступ запрещен: Вы можете редактировать только свой профиль');
    }

    const allowedFields = {};

    // Fields both admin and user can update on own profile
    if (data.name !== undefined) allowedFields.name = data.name.trim();
    if (data.phone !== undefined) allowedFields.phone = data.phone.trim();
    if (data.telegramUser !== undefined) allowedFields.telegramUser = data.telegramUser.trim();
    if (data.description !== undefined) allowedFields.description = data.description.trim();

    // Admin exclusive fields: can edit organization, inn, active status, role
    if (isAdmin) {
      if (data.organization !== undefined) allowedFields.organization = data.organization.trim();
      if (data.inn !== undefined) allowedFields.inn = data.inn.trim();
      if (data.active !== undefined) allowedFields.active = Boolean(data.active);
      if (data.role !== undefined) allowedFields.role = data.role;
      if (data.contractorId !== undefined) allowedFields.contractorId = data.contractorId;
    }

    const updatedUser = this.repository.updateUser(id, allowedFields);

    // Also update any matching reports if organization name or representative changed
    if (allowedFields.organization || allowedFields.name) {
      const reports = this.repository.getAllReports();
      let hasReportUpdates = false;
      reports.forEach(r => {
        if (r.contractor?.id === user.contractorId || r.contractor?.name === user.organization) {
          if (allowedFields.organization) r.contractor.name = allowedFields.organization;
          if (allowedFields.name) r.contractor.representative = allowedFields.name;
          if (allowedFields.inn) r.contractor.inn = allowedFields.inn;
          if (allowedFields.phone) r.contractor.phone = allowedFields.phone;
          hasReportUpdates = true;
        }
      });
      if (hasReportUpdates) {
        this.repository.saveReports(reports);
      }
    }

    return updatedUser;
  }

  deleteReport(id) {
    return this.repository.deleteReport(id);
  }

  getContractors() {
    return this.repository.getAllContractors();
  }

  getConstructions() {
    return this.repository.getAllConstructions();
  }

  getStats() {
    const reports = this.repository.getAllReports();
    const contractors = new Set(reports.map(r => r.contractor?.name).filter(Boolean));
    const constructions = new Set(reports.map(r => r.construction?.code).filter(Boolean));
    const verified = reports.filter(r => r.verificationStatus === 'verified').length;
    const defects = reports.filter(r => r.status === 'defect_reported').length;

    return {
      totalReports: reports.length,
      uniqueContractors: contractors.size,
      uniqueConstructions: constructions.size,
      verifiedReports: verified,
      defectReports: defects
    };
  }

  exportCSV() {
    const reports = this.getOrderedReports({ sortBy: 'contractor_hierarchy' });
    const headers = [
      '№ Отчета',
      '1. Поставщик (Подрядчик)',
      'Представитель',
      'Телефон / Telegram',
      '2. Локация (Город)',
      'Адрес конструкции',
      'Координаты (Широта, Долгота)',
      '3. Конструкция (Код)',
      'Тип конструкции',
      'Сторона',
      '4. Дата фиксации',
      'Время фиксации',
      'Рекламная кампания',
      'Статус размещения',
      'Замечания / Дефекты',
      'Верификация'
    ];

    const rows = reports.map((r, i) => [
      i + 1,
      `"${(r.contractor?.name || '').replace(/"/g, '""')}"`,
      `"${(r.contractor?.representative || '').replace(/"/g, '""')}"`,
      `"${(r.contractor?.phone || r.contractor?.telegramUser || '').replace(/"/g, '""')}"`,
      `"${(r.location?.city || '').replace(/"/g, '""')}"`,
      `"${(r.location?.address || '').replace(/"/g, '""')}"`,
      `"${r.location?.latitude && r.location?.longitude ? `${r.location.latitude}, ${r.location.longitude}` : 'Не указаны'}"`,
      `"${(r.construction?.code || '').replace(/"/g, '""')}"`,
      `"${(r.construction?.type || '').replace(/"/g, '""')}"`,
      `"${(r.construction?.side || '').replace(/"/g, '""')}"`,
      `"${r.displayDate}"`,
      `"${r.displayTime}"`,
      `"${(r.campaignName || '').replace(/"/g, '""')}"`,
      `"${r.status === 'mounted' ? 'Размещено' : r.status === 'illumination_ok' ? 'Освещение проверено' : r.status === 'defect_reported' ? 'Дефект/Повреждение' : 'Демонтировано'}"`,
      `"${(r.defectDetails || r.notes || '').replace(/"/g, '""')}"`,
      `"${r.verificationStatus === 'verified' ? 'Подтвержден' : r.verificationStatus === 'rejected' ? 'Отклонен' : 'На проверке'}"`
    ]);

    return [headers.join(';'), ...rows.map(row => row.join(';'))].join('\r\n');
  }
}

export const reportService = new ReportService();
