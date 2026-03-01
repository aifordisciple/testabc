export const API_ENDPOINTS = {
  auth: {
    login: '/auth/login',
    register: '/auth/register',
    me: '/auth/me',
    logout: '/auth/logout',
    forgotPassword: '/auth/forgot-password',
    resetPassword: '/auth/reset-password',
  },
  
  projects: {
    list: '/files/projects',
    get: (id: string) => `/files/projects/${id}`,
    create: '/files/projects',
    update: (id: string) => `/files/projects/${id}`,
    delete: (id: string) => `/files/projects/${id}`,
    files: (id: string, folderId?: string) => 
      `/files/projects/${id}/files${folderId ? `?folder_id=${folderId}` : ''}`,
    folders: (id: string) => `/files/projects/${id}/folders`,
  },
  
  files: {
    get: (id: string) => `/files/files/${id}`,
    download: (id: string) => `/files/files/${id}/download`,
    upload: '/files/upload',
    rename: (id: string) => `/files/files/${id}/rename`,
    delete: (id: string) => `/files/files/${id}`,
    link: (id: string) => `/files/files/${id}/link`,
  },
  
  samples: {
    list: (projectId: string) => `/samples/sheets?project_id=${projectId}`,
    get: (id: string) => `/samples/sheets/${id}`,
    samples: (sheetId: string) => `/samples/sheets/${sheetId}/samples`,
    create: '/samples/sheets',
    delete: (id: string) => `/samples/sheets/${id}`,
  },
  
  workflows: {
    list: '/workflows/templates',
    get: (id: string) => `/workflows/templates/${id}`,
    create: '/workflows/templates',
    update: (id: string) => `/workflows/templates/${id}`,
    delete: (id: string) => `/workflows/templates/${id}`,
  },
  
  analyses: {
    list: (projectId: string) => `/analyses?project_id=${projectId}`,
    get: (id: string) => `/analyses/${id}`,
    create: '/analyses',
    cancel: (id: string) => `/analyses/${id}/cancel`,
    logs: (id: string) => `/analyses/${id}/logs`,
    saveTemplate: (id: string) => `/analyses/${id}/save-template`,
  },
  
  chat: {
    stream: (projectId: string) => `/ai/projects/${projectId}/chat/stream`,
    history: (projectId: string, sessionId: string) => 
      `/ai/projects/${projectId}/chat/history?session_id=${sessionId}`,
    sessions: (projectId: string) => `/ai/projects/${projectId}/chat/sessions`,
    deleteSession: (projectId: string, sessionId: string) => 
      `/ai/projects/${projectId}/chat/sessions/${sessionId}`,
    clearSession: (projectId: string, sessionId: string) => 
      `/ai/projects/${projectId}/chat/sessions/${sessionId}/clear`,
    confirmPlan: (projectId: string) => `/ai/projects/${projectId}/chat/execute-plan`,
    confirmTool: (projectId: string) => `/ai/projects/${projectId}/chat/confirm-tool`,
    pendingTasks: (projectId: string) => `/ai/projects/${projectId}/chat/has-pending-tasks`,
  },
  
  knowledgeBase: {
    search: '/knowledge-base/search',
    get: (id: string) => `/knowledge-base/${id}`,
    import: '/knowledge-base/import',
    datasets: '/knowledge-base/datasets',
  },
} as const;
