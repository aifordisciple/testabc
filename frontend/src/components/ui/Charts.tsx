'use client';

import { useQuery } from '@tanstack/react-query';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts';
import { Activity, Clock, CheckCircle2, XCircle, TrendingUp, HardDrive } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocale } from '@/stores/localeStore';
import { api } from '@/lib/api';

interface Analysis {
  id: string;
  workflow: string;
  status: string;
  start_time: string;
  end_time?: string;
}

interface StorageInfo {
  used: number;
  total: number;
}

const COLORS = ['#3b82f6', '#10b981', '#ef4444', '#f59e0b'];

const translations = {
  zh: {
    taskStats: '任务统计',
    storageOverview: '存储概览',
    weeklyActivity: '本周活动',
    taskDistribution: '任务分布',
    running: '运行中',
    completed: '已完成',
    failed: '失败',
    queued: '排队中',
    storage: '存储',
    used: '已用',
    available: '可用',
  },
  en: {
    taskStats: 'Task Statistics',
    storageOverview: 'Storage Overview',
    weeklyActivity: 'Weekly Activity',
    taskDistribution: 'Task Distribution',
    running: 'Running',
    completed: 'Completed',
    failed: 'Failed',
    queued: 'Queued',
    storage: 'Storage',
    used: 'Used',
    available: 'Available',
  }
};

const fetchAPI = async (endpoint: string) => {
  const token = localStorage.getItem('token');
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
  const res = await fetch(`${apiUrl}${endpoint}`, { 
    headers: { Authorization: `Bearer ${token}` } 
  });
  if (!res.ok) throw new Error(`API fetch error on ${endpoint}`);
  return res.json();
};

export function TaskStatsChart() {
  const { locale } = useLocale();
  const t = translations[locale];

  const { data: analyses = [], isLoading } = useQuery<Analysis[]>({
    queryKey: ['task-stats-analyses'],
    queryFn: () => fetchAPI('/workflow/analyses?limit=100'),
    refetchInterval: 30000
  });

  const runningCount = analyses.filter(a => a.status === 'running').length;
  const completedCount = analyses.filter(a => a.status === 'completed').length;
  const failedCount = analyses.filter(a => a.status === 'failed').length;
  const queuedCount = analyses.filter(a => a.status === 'pending').length;

  const pieData = [
    { name: t.running, value: runningCount, color: '#3b82f6' },
    { name: t.completed, value: completedCount, color: '#10b981' },
    { name: t.failed, value: failedCount, color: '#ef4444' },
    { name: t.queued, value: queuedCount, color: '#f59e0b' },
  ].filter(d => d.value > 0);

  // Generate weekly activity data
  const getWeeklyData = () => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const today = new Date();
    const dayOfWeek = today.getDay();
    
    return days.map((day, idx) => {
      const dayIndex = idx + 1;
      const date = new Date(today);
      date.setDate(today.getDate() - (dayOfWeek - idx));
      
      const dayAnalyses = analyses.filter(a => {
        const taskDate = new Date(a.start_time);
        return taskDate.toDateString() === date.toDateString();
      });
      
      return {
        day: locale === 'zh' 
          ? ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][idx]
          : day,
        completed: dayAnalyses.filter(a => a.status === 'completed').length,
        failed: dayAnalyses.filter(a => a.status === 'failed').length,
      };
    });
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Task Distribution Pie */}
      <Card className="bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            {t.taskDistribution}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Weekly Activity Bar */}
      <Card className="bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            {t.weeklyActivity}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={getWeeklyData()}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
              />
              <Legend />
              <Bar dataKey="completed" name={t.completed} fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="failed" name={t.failed} fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

export function StorageChart() {
  const { locale } = useLocale();
  const t = translations[locale];

  const { data: storageData, isLoading } = useQuery<StorageInfo>({
    queryKey: ['storage-chart'],
    queryFn: () => fetchAPI('/files/storage'),
  });

  if (isLoading) {
    return <Skeleton className="h-48 rounded-xl" />;
  }

  const usedGB = (storageData?.used || 0) / (1024 * 1024 * 1024);
  const totalGB = (storageData?.total || 0) / (1024 * 1024 * 1024);
  const availableGB = totalGB - usedGB;

  const pieData = [
    { name: t.used, value: usedGB, color: '#8b5cf6' },
    { name: t.available, value: availableGB, color: 'hsl(var(--muted))' },
  ];

  return (
    <Card className="bg-card/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-primary" />
          {t.storageOverview}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6">
          <ResponsiveContainer width={140} height={140}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={60}
                paddingAngle={2}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value) => `${Number(value).toFixed(1)} GB`}
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-3">
            <div>
              <p className="text-2xl font-bold">{usedGB.toFixed(1)} GB</p>
              <p className="text-sm text-muted-foreground">{t.used}</p>
            </div>
            <div>
              <p className="text-lg font-medium">{totalGB.toFixed(0)} GB</p>
              <p className="text-sm text-muted-foreground">{t.storage}</p>
            </div>
            <div className="pt-2 border-t border-border">
              <p className="text-sm text-muted-foreground">
                {((usedGB / totalGB) * 100).toFixed(1)}% {locale === 'zh' ? '已使用' : 'used'}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
