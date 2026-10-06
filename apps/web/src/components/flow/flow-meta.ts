// Label dan ikon bersama untuk komponen diagram alur bisnis
import { User, Cpu, Globe, PlayCircle, Activity, GitBranch, StopCircle } from 'lucide-react';
import type { FlowLane, FlowStep } from '@/lib/flow-layout';

export const LANE_ICON: Record<FlowLane['kind'], typeof User> = {
  human: User,
  system: Cpu,
  external: Globe,
};

export const LANE_KIND_LABEL: Record<FlowLane['kind'], string> = {
  human: 'Persona',
  system: 'Sistem',
  external: 'Layanan Eksternal',
};

export const STEP_ICON: Record<FlowStep['type'], typeof User> = {
  start: PlayCircle,
  process: Activity,
  decision: GitBranch,
  end: StopCircle,
};

export const STEP_TYPE_LABEL: Record<FlowStep['type'], string> = {
  start: 'Mulai',
  process: 'Proses',
  decision: 'Keputusan',
  end: 'Selesai',
};
