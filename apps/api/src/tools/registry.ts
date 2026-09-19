// Registry tool untuk dashboard. Tool baru = tambah entry di sini.
// (Bukan tabel DB; metadata statis lebih mudah diatur versinya.)

export type ToolMeta = {
  id: string;
  name: string;
  description: string;
  icon: string; // nama icon lucide-react
  href: (projectId: string) => string;
  status: 'available' | 'coming-soon';
};

export const toolsRegistry: ToolMeta[] = [
  {
    id: 'brd-generator',
    name: 'BRD Generator',
    description: 'Wawancara AI untuk menggali kebutuhan, hasilkan Business Requirements Document.',
    icon: 'FileText',
    href: (projectId) => `/projects/${projectId}/brd`,
    status: 'available',
  },
  {
    id: 'roadmap',
    name: 'Roadmap Visual',
    description: 'Diagram alur fase & fitur dari BRD, mudah dipahami.',
    icon: 'GitBranch',
    href: (projectId) => `/projects/${projectId}/roadmap`,
    status: 'available',
  },
  {
    id: 'tasks',
    name: 'Task Kanban',
    description: 'Board eksekusi atomic tasks hasil generate AI.',
    icon: 'Trello',
    href: (projectId) => `/projects/${projectId}/tasks`,
    status: 'available',
  },
  {
    id: 'execute',
    name: 'Eksekusi via CLI',
    description: 'Salin Master Prompt dan jalankan AI Agent lewat `npx numa`.',
    icon: 'Terminal',
    href: (projectId) => `/projects/${projectId}/execute`,
    status: 'available',
  },
  {
    id: 'settings',
    name: 'Pengaturan Project',
    description: 'Generate token CLI, atur preferensi project.',
    icon: 'Settings',
    href: (projectId) => `/projects/${projectId}/settings`,
    status: 'available',
  },
];
