'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  FiHome, FiTarget, FiCheckSquare, FiActivity, FiSettings,
  FiPlus, FiSend, FiMail, FiUser, FiUsers, FiSearch,
  FiCheck, FiX, FiAlertCircle, FiEdit2, FiTrash2,
  FiChevronRight, FiChevronDown, FiMenu, FiXCircle,
  FiClock, FiTrendingUp, FiExternalLink, FiCopy,
  FiRefreshCw, FiFilter, FiEye, FiStar, FiZap,
  FiHash, FiMessageSquare, FiSlack, FiGlobe, FiLinkedin,
  FiArrowRight, FiInfo, FiServer, FiShield, FiToggleLeft,
  FiToggleRight, FiDatabase, FiCode, FiLayers, FiDollarSign,
  FiAlertTriangle, FiArrowUpRight, FiInbox
} from 'react-icons/fi'

// ===== AGENT IDS =====
const CAMPAIGN_ORCHESTRATOR_ID = '699845de07f346cb61eddd5d'
const EMAIL_DELIVERY_AGENT_ID = '69984626155b7b746277f0c4'
const ENGAGEMENT_MONITOR_AGENT_ID = '69984626b5f6816ff2fd38aa'

// ===== TYPES =====
type OutreachChannel = 'email' | 'linkedin'

interface TimelineEvent {
  id: string
  channel: OutreachChannel
  action: string
  date: string
  detail?: string
}

interface Lead {
  id: string
  name: string
  company: string
  companyUrl: string
  linkedinUrl: string
  email: string
  channel: OutreachChannel
  status: 'new' | 'researched' | 'drafted' | 'sent' | 'hot_lead' | 'replied' | 'closed'
  lastAction: string
  lastActionDate: string
  researchSummary?: string
  subjectLine?: string
  emailBody?: string
  linkedinMessage?: string
  followUp1?: string
  followUp2?: string
  followUp3?: string
  qualityScore?: number
  flags?: string
  approved?: boolean
  engagementSignal?: string
  daysSinceContact?: number
  timeline?: TimelineEvent[]
}

interface Settings {
  slackChannel: string
  followUpDays: number
  rotationCaseStudy: boolean
  rotationRoiCalculator: boolean
  rotationCheckin: boolean
  brandVoice: 'founder' | 'professional'
  emailSignature: string
}

interface EmailResult {
  lead_name?: string
  email?: string
  status?: string
  timestamp?: string
  error?: string
}

interface EngagementResult {
  lead_name?: string
  company?: string
  status?: string
  signal_type?: string
  channel?: OutreachChannel
  follow_up_draft?: string
  days_since_contact?: number
}

// ===== SENDER ACCOUNT TYPE =====
interface SenderAccount {
  id: string
  email: string
  displayName: string
  dailyLimit: number
  sentToday: number
  healthScore: number
  active: boolean
  provider: 'google' | 'smtp'
}

// ===== RESEARCH TAG TYPE =====
interface ResearchTag {
  label: string
  value: string
  category: 'funding' | 'tech_stack' | 'bottleneck' | 'trigger' | 'role' | 'company_stage' | 'interest'
}

// ===== EXTRACT RESEARCH TAGS =====
function extractResearchTags(summary: string, lead: Lead): ResearchTag[] {
  const tags: ResearchTag[] = []
  if (!summary) return tags

  const lower = summary.toLowerCase()

  // Role detection
  const rolePatterns = [/\b(VP|CTO|CEO|Head|Director|Co-founder|Founder|Manager)\s+(?:of\s+)?([A-Za-z\s&]+?)(?:\s+at\b|,|\.|$)/i]
  for (const p of rolePatterns) {
    const m = summary.match(p)
    if (m) { tags.push({ label: 'Role', value: m[0].trim().replace(/[.,]$/, ''), category: 'role' }); break }
  }

  // Funding
  if (/series\s+[a-d]/i.test(lower) || /seed\s+round/i.test(lower) || /raised/i.test(lower) || /funding/i.test(lower)) {
    const fm = summary.match(/(Series\s+[A-D]|Seed\s+Round|raised\s+\$[\d.]+[MBK]?|Recently\s+raised\s+[^.]+)/i)
    tags.push({ label: 'Recent Funding', value: fm ? fm[0] : 'Funding activity detected', category: 'funding' })
  }

  // Tech stack
  const techKeywords = ['React', 'Node', 'Python', 'AWS', 'GCP', 'Azure', 'Kubernetes', 'Docker', 'TypeScript', 'JavaScript', 'Go', 'Rust', 'PostgreSQL', 'MongoDB', 'Redis', 'Kafka', 'SaaS', 'cloud infrastructure', 'data pipeline', 'data integration']
  const foundTech: string[] = []
  for (const t of techKeywords) {
    if (lower.includes(t.toLowerCase())) foundTech.push(t)
  }
  if (foundTech.length > 0) tags.push({ label: 'Tech Stack', value: foundTech.join(', '), category: 'tech_stack' })

  // Bottleneck / challenges
  const bottleneckPatterns = [/scaling\s+(?:challenges?|issues?|problems?)/i, /challenges?\s+of\s+[^.]+/i, /bottleneck[^.]+/i, /struggling\s+with\s+[^.]+/i, /pain\s+points?\s*:?\s*[^.]+/i]
  for (const p of bottleneckPatterns) {
    const bm = summary.match(p)
    if (bm) { tags.push({ label: 'Current Bottleneck', value: bm[0].trim(), category: 'bottleneck' }); break }
  }

  // Company stage
  if (/startup/i.test(lower)) tags.push({ label: 'Company Stage', value: 'Startup', category: 'company_stage' })
  else if (/enterprise/i.test(lower)) tags.push({ label: 'Company Stage', value: 'Enterprise', category: 'company_stage' })
  else if (/agency/i.test(lower)) tags.push({ label: 'Company Stage', value: 'Agency', category: 'company_stage' })

  // Triggers
  if (/recently\s+posted/i.test(lower) || /recent\s+post/i.test(lower)) {
    tags.push({ label: 'Trigger', value: 'Recent LinkedIn activity', category: 'trigger' })
  }
  if (/hiring/i.test(lower) || /new\s+hires/i.test(lower)) {
    tags.push({ label: 'Trigger', value: 'Hiring signals', category: 'trigger' })
  }
  if (/expanding/i.test(lower) || /expansion/i.test(lower) || /growing/i.test(lower)) {
    tags.push({ label: 'Trigger', value: 'Expansion activity', category: 'trigger' })
  }

  // Interest
  if (/interested\s+in\s+([^.]+)/i.test(lower)) {
    const im = summary.match(/interested\s+in\s+([^.]+)/i)
    if (im) tags.push({ label: 'Interest', value: im[1].trim(), category: 'interest' })
  }
  if (/looking\s+for\s+([^.]+)/i.test(lower)) {
    const lm = summary.match(/looking\s+for\s+([^.]+)/i)
    if (lm) tags.push({ label: 'Interest', value: lm[1].trim(), category: 'interest' })
  }

  return tags
}

// ===== HIGHLIGHT RESEARCH VARS IN DRAFT =====
function highlightDraftText(text: string, tags: ResearchTag[]): React.ReactNode[] {
  if (!text || tags.length === 0) return [text]

  // Gather phrases to highlight from tag values
  const phrases: string[] = []
  for (const tag of tags) {
    const words = tag.value.split(/[,;]/).map(w => w.trim()).filter(w => w.length > 3)
    phrases.push(...words)
  }

  if (phrases.length === 0) return [text]

  // Sort by length descending so longer phrases match first
  phrases.sort((a, b) => b.length - a.length)

  // Escape regex special chars
  const escaped = phrases.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi')

  const parts = text.split(regex)
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return <mark key={i} className="bg-amber-100/80 text-amber-900 px-0.5 rounded-sm border-b border-amber-300 font-medium" title="Personalized from research">{part}</mark>
    }
    return <span key={i}>{part}</span>
  })
}

// ===== RESEARCH TAG CATEGORY COLORS =====
function tagCategoryStyle(category: ResearchTag['category']): string {
  switch (category) {
    case 'funding': return 'bg-green-50 text-green-700 border-green-200'
    case 'tech_stack': return 'bg-violet-50 text-violet-700 border-violet-200'
    case 'bottleneck': return 'bg-red-50 text-red-700 border-red-200'
    case 'trigger': return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'role': return 'bg-sky-50 text-sky-700 border-sky-200'
    case 'company_stage': return 'bg-purple-50 text-purple-700 border-purple-200'
    case 'interest': return 'bg-amber-50 text-amber-700 border-amber-200'
    default: return 'bg-gray-50 text-gray-700 border-gray-200'
  }
}

function tagCategoryIcon(category: ResearchTag['category']): React.ReactNode {
  switch (category) {
    case 'funding': return <FiDollarSign size={10} />
    case 'tech_stack': return <FiCode size={10} />
    case 'bottleneck': return <FiAlertTriangle size={10} />
    case 'trigger': return <FiZap size={10} />
    case 'role': return <FiUser size={10} />
    case 'company_stage': return <FiLayers size={10} />
    case 'interest': return <FiSearch size={10} />
    default: return <FiInfo size={10} />
  }
}

// ===== SAMPLE SENDER ACCOUNTS =====
function generateSampleSenders(): SenderAccount[] {
  return [
    { id: 'sa1', email: 'alex@zaps.io', displayName: 'Alex Thompson', dailyLimit: 50, sentToday: 12, healthScore: 98, active: true, provider: 'google' },
    { id: 'sa2', email: 'a.thompson@zaps.io', displayName: 'A. Thompson', dailyLimit: 40, sentToday: 8, healthScore: 95, active: true, provider: 'google' },
    { id: 'sa3', email: 'outreach@zaps.io', displayName: 'Zaps Outreach', dailyLimit: 30, sentToday: 28, healthScore: 72, active: true, provider: 'smtp' },
    { id: 'sa4', email: 'hello@zaps.io', displayName: 'Zaps Hello', dailyLimit: 25, sentToday: 0, healthScore: 100, active: false, provider: 'smtp' },
  ]
}

// ===== CLIPBOARD HELPER =====
function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => false)
  }
  // Fallback
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    document.execCommand('copy')
    document.body.removeChild(textarea)
    return Promise.resolve(true)
  } catch {
    document.body.removeChild(textarea)
    return Promise.resolve(false)
  }
}

// ===== CHANNEL ICON =====
function ChannelIcon({ channel, size = 14 }: { channel?: OutreachChannel; size?: number }) {
  if (channel === 'linkedin') return <FiLinkedin size={size} className="text-[#0A66C2]" />
  return <FiMail size={size} className="text-primary" />
}

type Screen = 'dashboard' | 'campaigns' | 'review' | 'engagement' | 'settings'

// ===== SAMPLE DATA =====
function generateSampleLeads(): Lead[] {
  return [
    {
      id: 's1', name: 'Sarah Chen', company: 'TechFlow Inc', companyUrl: 'https://techflow.io', linkedinUrl: 'https://linkedin.com/in/sarachen', email: 'sarah@techflow.io', channel: 'email', status: 'hot_lead', lastAction: 'Replied to follow-up email', lastActionDate: '2026-02-19',
      researchSummary: 'VP of Engineering at TechFlow, a Series B SaaS startup. Recently posted about scaling challenges.',
      subjectLine: 'Scaling your engineering org, Sarah?',
      emailBody: 'Hi Sarah,\n\nI noticed your recent post about the challenges of scaling an engineering team from 20 to 50. At Zaps, we help teams like yours automate repetitive workflows so your engineers can focus on what matters.\n\nWould love to share how we helped a similar team save 15 hours per week.\n\nBest,\nAlex',
      linkedinMessage: 'Hi Sarah - saw your post on scaling eng teams past 50. We helped a similar B2B SaaS team cut 15 hours/week of manual workflow overhead. Would love to connect and share the approach if useful.',
      followUp1: 'Quick follow-up on my previous note about engineering efficiency.', followUp2: 'Case study: How DataPipe saved 200 hours/month with workflow automation.', followUp3: 'Last check-in - would a 15-min demo be helpful?',
      qualityScore: 92, flags: 'High engagement', approved: true, engagementSignal: 'reply', daysSinceContact: 1,
      timeline: [
        { id: 't1', channel: 'linkedin', action: 'LinkedIn Connection Sent', date: '2026-02-14', detail: 'Connection request with personalized note' },
        { id: 't2', channel: 'linkedin', action: 'LinkedIn Connection Accepted', date: '2026-02-15', detail: 'Sarah accepted the connection' },
        { id: 't3', channel: 'email', action: 'Email Drafted', date: '2026-02-16', detail: 'PAS framework email generated' },
        { id: 't4', channel: 'email', action: 'Email Sent', date: '2026-02-17', detail: 'Initial outreach email delivered' },
        { id: 't5', channel: 'email', action: 'Email Opened', date: '2026-02-18', detail: 'Opened 3 times' },
        { id: 't6', channel: 'email', action: 'Email Replied', date: '2026-02-19', detail: 'Positive reply - interested in demo' },
      ],
    },
    {
      id: 's2', name: 'Marcus Rodriguez', company: 'GrowthLab', companyUrl: 'https://growthlab.co', linkedinUrl: 'https://linkedin.com/in/marcusr', email: 'marcus@growthlab.co', channel: 'linkedin', status: 'sent', lastAction: 'LinkedIn DM sent', lastActionDate: '2026-02-17',
      researchSummary: 'Co-founder at GrowthLab, a growth marketing agency. Looking for automation tools.',
      subjectLine: 'Automate your client reporting, Marcus?',
      emailBody: 'Hi Marcus,\n\nAs a growth marketing agency founder, I imagine client reporting takes up a huge chunk of your week. Zaps can automate your cross-platform reporting pipeline.\n\nInterested in seeing how?\n\nBest,\nAlex',
      linkedinMessage: 'Hey Marcus - fellow founder here. I know client reporting eats hours every week for agency teams. We built something at Zaps that automates cross-platform reporting. Worth a quick look?',
      followUp1: 'Following up on automating your reporting workflows.', followUp2: 'ROI Calculator: See how much time you could save.', followUp3: 'Final nudge - happy to do a quick walkthrough.',
      qualityScore: 78, flags: '', approved: true, engagementSignal: 'no_response', daysSinceContact: 3,
      timeline: [
        { id: 't1', channel: 'linkedin', action: 'LinkedIn Connection Sent', date: '2026-02-15', detail: 'Connection request sent' },
        { id: 't2', channel: 'linkedin', action: 'LinkedIn Connection Accepted', date: '2026-02-16', detail: 'Marcus accepted' },
        { id: 't3', channel: 'linkedin', action: 'LinkedIn DM Sent', date: '2026-02-17', detail: 'Personalized DM delivered' },
        { id: 't4', channel: 'email', action: 'Email Drafted', date: '2026-02-18', detail: 'Follow-up email generated as backup channel' },
      ],
    },
    {
      id: 's3', name: 'Priya Patel', company: 'CloudNine Solutions', companyUrl: 'https://cloudnine.dev', linkedinUrl: 'https://linkedin.com/in/priyap', email: 'priya@cloudnine.dev', channel: 'email', status: 'drafted', lastAction: 'Draft generated', lastActionDate: '2026-02-18',
      researchSummary: 'CTO at CloudNine Solutions, a cloud infrastructure company. Recently raised Series A.',
      subjectLine: 'Post-Series A scaling at CloudNine?',
      emailBody: 'Hi Priya,\n\nCongratulations on the Series A! As you scale CloudNine, automating internal workflows becomes critical. We help CTOs like you build reliable automation pipelines.\n\nHappy to share our approach?\n\nBest,\nAlex',
      linkedinMessage: 'Congrats on the Series A, Priya! Scaling ops post-funding is tough. We help CTOs like you automate internal workflows so your team can move faster. Happy to share how if helpful.',
      followUp1: 'Quick note on scaling post-funding.', followUp2: 'How CloudBase automated 80% of their ops workflows.', followUp3: 'Last check-in on workflow automation.',
      qualityScore: 85, flags: 'Recent funding', approved: false, daysSinceContact: 2,
      timeline: [
        { id: 't1', channel: 'linkedin', action: 'LinkedIn Profile Researched', date: '2026-02-17', detail: 'Recent Series A announcement found' },
        { id: 't2', channel: 'email', action: 'Email Drafted', date: '2026-02-18', detail: 'PAS framework email with funding angle' },
      ],
    },
    {
      id: 's4', name: 'David Kim', company: 'OptiFlow', companyUrl: 'https://optiflow.ai', linkedinUrl: 'https://linkedin.com/in/davidkim', email: 'david@optiflow.ai', channel: 'linkedin', status: 'new', lastAction: 'Added to pipeline', lastActionDate: '2026-02-20',
      linkedinMessage: 'Hi David - noticed OptiFlow is building in the AI optimization space. We help teams like yours automate the tedious parts of the dev pipeline. Would love to connect.',
      qualityScore: 0, flags: '',
      timeline: [
        { id: 't1', channel: 'linkedin', action: 'Added to Pipeline', date: '2026-02-20', detail: 'LinkedIn-first outreach planned' },
      ],
    },
    {
      id: 's5', name: 'Lisa Wang', company: 'DataStream', companyUrl: 'https://datastream.io', linkedinUrl: 'https://linkedin.com/in/lisawang', email: 'lisa@datastream.io', channel: 'email', status: 'replied', lastAction: 'Positive reply received', lastActionDate: '2026-02-18',
      researchSummary: 'Head of Product at DataStream. Interested in data pipeline automation.',
      subjectLine: 'Streamline your data pipelines, Lisa?',
      emailBody: 'Hi Lisa,\n\nI saw DataStream is expanding its data integration capabilities. Our automation tools can help speed up your pipeline development by 3x.\n\nWorth a quick chat?\n\nBest,\nAlex',
      linkedinMessage: 'Hi Lisa - saw DataStream is expanding data integrations. Our tools can speed up pipeline dev by 3x. Happy to share how if you are interested.',
      qualityScore: 88, flags: 'Booking demo', approved: true, engagementSignal: 'reply', daysSinceContact: 2,
      timeline: [
        { id: 't1', channel: 'linkedin', action: 'LinkedIn Connection Sent', date: '2026-02-13', detail: 'Initial connection request' },
        { id: 't2', channel: 'linkedin', action: 'LinkedIn Connection Accepted', date: '2026-02-14', detail: 'Lisa accepted' },
        { id: 't3', channel: 'linkedin', action: 'LinkedIn DM Sent', date: '2026-02-14', detail: 'Brief intro message' },
        { id: 't4', channel: 'email', action: 'Email Drafted', date: '2026-02-15', detail: 'Full PAS framework email' },
        { id: 't5', channel: 'email', action: 'Email Sent', date: '2026-02-16', detail: 'Outreach email delivered' },
        { id: 't6', channel: 'email', action: 'Email Replied', date: '2026-02-18', detail: 'Interested in scheduling a demo' },
      ],
    },
  ]
}

// ===== MARKDOWN RENDERER =====
function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold">{part}</strong>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-2">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### ')) return <h4 key={i} className="font-semibold text-sm mt-3 mb-1">{line.slice(4)}</h4>
        if (line.startsWith('## ')) return <h3 key={i} className="font-semibold text-base mt-3 mb-1">{line.slice(3)}</h3>
        if (line.startsWith('# ')) return <h2 key={i} className="font-bold text-lg mt-4 mb-2">{line.slice(2)}</h2>
        if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="ml-4 list-disc text-sm">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line)) return <li key={i} className="ml-4 list-decimal text-sm">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-sm">{formatInline(line)}</p>
      })}
    </div>
  )
}

// ===== ERROR BOUNDARY =====
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-4 text-sm">{this.state.error}</p>
            <button onClick={() => this.setState({ hasError: false, error: '' })} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm">
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ===== HELPER: STATUS BADGE =====
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    new: { label: 'New', className: 'bg-gray-100 text-gray-700 border-gray-200' },
    researched: { label: 'Researched', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    drafted: { label: 'Drafted', className: 'bg-amber-50 text-amber-700 border-amber-200' },
    sent: { label: 'Sent', className: 'bg-sky-50 text-sky-700 border-sky-200' },
    hot_lead: { label: 'Hot Lead', className: 'bg-red-50 text-red-700 border-red-200' },
    replied: { label: 'Replied', className: 'bg-green-50 text-green-700 border-green-200' },
    closed: { label: 'Closed', className: 'bg-purple-50 text-purple-700 border-purple-200' },
    success: { label: 'Success', className: 'bg-green-50 text-green-700 border-green-200' },
    failed: { label: 'Failed', className: 'bg-red-50 text-red-700 border-red-200' },
    reply: { label: 'Reply', className: 'bg-green-50 text-green-700 border-green-200' },
    no_response: { label: 'No Response', className: 'bg-gray-100 text-gray-600 border-gray-200' },
    link_click: { label: 'Link Click', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    open: { label: 'Opened', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  }
  const config = map[status?.toLowerCase()] || { label: status || 'Unknown', className: 'bg-gray-100 text-gray-600 border-gray-200' }
  return <Badge variant="outline" className={cn('text-xs font-medium', config.className)}>{config.label}</Badge>
}

// ===== HELPER: STAT CARD =====
function StatCard({ icon, label, value, trend }: { icon: React.ReactNode; label: string; value: string | number; trend?: string }) {
  return (
    <Card className="bg-white/75 backdrop-blur-[16px] border border-white/[0.18] shadow-md">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">{icon}</div>
          {trend && <span className="text-xs font-medium text-green-600 flex items-center gap-1"><FiTrendingUp size={12} />{trend}</span>}
        </div>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
      </CardContent>
    </Card>
  )
}

// ===== HELPER: PIPELINE COLUMN (ENHANCED) =====
function PipelineColumn({ title, leads, color, followUpDays, onAction }: { title: string; leads: Lead[]; color: string; followUpDays: number; onAction?: (lead: Lead, action: string) => void }) {
  const isStaleColumn = ['researched', 'sent', 'drafted'].includes(title.toLowerCase().replace(' ', '_'))

  const getDaysSinceAction = (dateStr: string) => {
    if (!dateStr) return 0
    const d = new Date(dateStr)
    const now = new Date()
    return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  }

  const getQuickAction = (lead: Lead): { label: string; action: string } | null => {
    const status = title.toLowerCase().replace(' ', '_')
    if (status === 'new') return { label: 'Research', action: 'research' }
    if (status === 'researched' || status === 'drafted') return { label: 'Review Now', action: 'review' }
    if (status === 'sent') return { label: 'Follow Up', action: 'follow_up' }
    if (status === 'hot_lead' || status === 'replied') return { label: 'View', action: 'view' }
    return null
  }

  return (
    <div className="min-w-[230px] flex-shrink-0">
      <div className="flex items-center gap-2 mb-3">
        <div className={cn('w-2.5 h-2.5 rounded-full', color)} />
        <span className="text-sm font-semibold">{title}</span>
        <Badge variant="secondary" className="text-xs ml-auto">{leads.length}</Badge>
      </div>
      <div className="space-y-2">
        {leads.map(lead => {
          const daysSince = getDaysSinceAction(lead.lastActionDate)
          const isStale = isStaleColumn && daysSince >= followUpDays
          const quickAction = getQuickAction(lead)
          const initials = lead.company?.split(/\s+/).map(w => w[0]).join('').substring(0, 2).toUpperCase() || '??'

          return (
            <Card key={lead.id} className={cn("bg-white/60 backdrop-blur-[8px] border shadow-sm hover:shadow-md transition-all duration-200 group", isStale ? 'border-amber-300 ring-1 ring-amber-200' : 'border-white/[0.15]')}>
              <CardContent className="p-3">
                {/* Stale alert badge */}
                {isStale && (
                  <div className="flex items-center gap-1 mb-1.5 text-amber-600">
                    <FiAlertTriangle size={11} />
                    <span className="text-[10px] font-medium">{daysSince}d idle - action needed</span>
                  </div>
                )}
                <div className="flex items-start gap-2.5">
                  {/* Company logo placeholder */}
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/10 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-primary/70">{initials}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-sm font-medium truncate flex-1">{lead.name}</p>
                      <ChannelIcon channel={lead.channel} size={11} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{lead.company}</p>
                  </div>
                </div>
                {lead.lastAction && <p className="text-xs text-muted-foreground mt-2 truncate flex items-center gap-1"><FiClock size={10} />{lead.lastAction}</p>}
                {/* Quick action button */}
                {quickAction && (
                  <Button
                    variant={isStale ? 'default' : 'outline'}
                    size="sm"
                    className={cn("w-full mt-2 h-7 text-xs gap-1 opacity-0 group-hover:opacity-100 transition-opacity", isStale && 'opacity-100')}
                    onClick={(e) => { e.stopPropagation(); onAction?.(lead, quickAction.action) }}
                  >
                    {isStale ? <FiAlertCircle size={11} /> : <FiArrowUpRight size={11} />}
                    {quickAction.label}
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
        {leads.length === 0 && (
          <div className="py-6 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">No leads</div>
        )}
      </div>
    </div>
  )
}

// ===== MAIN PAGE =====
export default function Page() {
  // ----- Navigation -----
  const [activeScreen, setActiveScreen] = useState<Screen>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sampleDataOn, setSampleDataOn] = useState(false)

  // ----- Lead state -----
  const [leads, setLeads] = useState<Lead[]>([])
  const [batchLeads, setBatchLeads] = useState<Lead[]>([])
  const [bulkText, setBulkText] = useState('')

  // ----- Form fields for campaign -----
  const [leadForm, setLeadForm] = useState({ name: '', company: '', companyUrl: '', linkedinUrl: '', email: '', channel: 'email' as OutreachChannel })

  // ----- Clipboard state -----
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // ----- Agent loading & status -----
  const [loading, setLoading] = useState(false)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  // ----- Review queue -----
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null)
  const [sendProgress, setSendProgress] = useState(0)
  const [sendResults, setSendResults] = useState<EmailResult[]>([])

  // ----- Engagement -----
  const [engagementFilter, setEngagementFilter] = useState('all')
  const [engagementResults, setEngagementResults] = useState<EngagementResult[]>([])
  const [engagementSummary, setEngagementSummary] = useState('')
  const [selectedEngagementLead, setSelectedEngagementLead] = useState<string | null>(null)
  const [engagementStats, setEngagementStats] = useState({ hot_leads_count: 0, follow_ups_due: 0, notifications_sent: 0 })

  // ----- Settings -----
  const [settings, setSettings] = useState<Settings>({
    slackChannel: '#sales-alerts',
    followUpDays: 4,
    rotationCaseStudy: true,
    rotationRoiCalculator: true,
    rotationCheckin: true,
    brandVoice: 'founder',
    emailSignature: 'Best regards,\nAlex Thompson\nFounder, Zaps\nalex@zaps.io',
  })

  // ----- Sender accounts -----
  const [senderAccounts, setSenderAccounts] = useState<SenderAccount[]>(generateSampleSenders())
  const [settingsTab, setSettingsTab] = useState<'general' | 'senders' | 'followup'>('general')

  // ----- Review Queue: selected lead for research panel -----
  const [reviewSelectedId, setReviewSelectedId] = useState<string | null>(null)

  // ----- Sample Data Toggle -----
  useEffect(() => {
    if (sampleDataOn) {
      setLeads(generateSampleLeads())
    } else {
      setLeads([])
      setBatchLeads([])
      setEngagementResults([])
      setEngagementSummary('')
      setSendResults([])
    }
  }, [sampleDataOn])

  // ----- Helpers -----
  const getLeadsByStatus = useCallback((status: Lead['status']) => {
    return leads.filter(l => l.status === status)
  }, [leads])

  const generateId = () => Math.random().toString(36).substring(2, 10)

  const clearMessages = () => { setStatusMessage(''); setErrorMessage('') }

  // ----- Add single lead -----
  const handleAddLead = () => {
    if (!leadForm.name.trim() || !leadForm.email.trim()) {
      setErrorMessage('Lead name and email are required.')
      return
    }
    clearMessages()
    const newLead: Lead = {
      id: generateId(),
      name: leadForm.name.trim(),
      company: leadForm.company.trim(),
      companyUrl: leadForm.companyUrl.trim(),
      linkedinUrl: leadForm.linkedinUrl.trim(),
      email: leadForm.email.trim(),
      channel: leadForm.channel,
      status: 'new',
      lastAction: 'Added to batch',
      lastActionDate: new Date().toISOString().split('T')[0],
    }
    setBatchLeads(prev => [...prev, newLead])
    setLeadForm({ name: '', company: '', companyUrl: '', linkedinUrl: '', email: '', channel: 'email' })
    setStatusMessage(`Added ${newLead.name} to batch.`)
  }

  // ----- Parse bulk text -----
  const handleParseBulk = () => {
    clearMessages()
    if (!bulkText.trim()) return
    const lines = bulkText.trim().split('\n').filter(l => l.trim())
    const parsed: Lead[] = []
    for (const line of lines) {
      const parts = line.split(',').map(p => p.trim())
      if (parts.length >= 2) {
        parsed.push({
          id: generateId(),
          name: parts[0] || '',
          company: parts[1] || '',
          companyUrl: parts[2] || '',
          linkedinUrl: parts[3] || '',
          email: parts[4] || '',
          channel: (parts[5]?.toLowerCase() === 'linkedin' ? 'linkedin' : 'email') as OutreachChannel,
          status: 'new',
          lastAction: 'Added via bulk',
          lastActionDate: new Date().toISOString().split('T')[0],
        })
      }
    }
    if (parsed.length > 0) {
      setBatchLeads(prev => [...prev, ...parsed])
      setBulkText('')
      setStatusMessage(`Parsed and added ${parsed.length} lead(s) from bulk input.`)
    } else {
      setErrorMessage('No valid leads found. Use format: Name, Company, CompanyURL, LinkedInURL, Email')
    }
  }

  // ----- Generate outreach drafts (Campaign Orchestrator) -----
  const handleGenerateDrafts = async () => {
    if (batchLeads.length === 0) {
      setErrorMessage('Add at least one lead before generating drafts.')
      return
    }
    clearMessages()
    setLoading(true)
    setActiveAgentId(CAMPAIGN_ORCHESTRATOR_ID)
    setStatusMessage('Researching leads and generating outreach drafts...')

    try {
      const leadsPayload = batchLeads.map(l => ({
        name: l.name,
        company: l.company,
        company_url: l.companyUrl,
        linkedin_url: l.linkedinUrl,
        email: l.email,
      }))

      const message = `Research and draft outreach emails for the following leads: ${JSON.stringify(leadsPayload)}`
      const result = await callAIAgent(message, CAMPAIGN_ORCHESTRATOR_ID)

      if (result.success) {
        const data = result?.response?.result
        const resultLeads = Array.isArray(data?.leads) ? data.leads : []

        const updatedLeads: Lead[] = batchLeads.map((bl, idx) => {
          const match = resultLeads[idx] || resultLeads.find((rl: any) => rl?.lead_name?.toLowerCase() === bl.name.toLowerCase())
          if (match) {
            return {
              ...bl,
              status: 'drafted' as const,
              lastAction: 'Draft generated',
              lastActionDate: new Date().toISOString().split('T')[0],
              researchSummary: match?.research_summary ?? '',
              subjectLine: match?.subject_line ?? '',
              emailBody: match?.email_body ?? '',
              linkedinMessage: match?.linkedin_message ?? match?.email_body?.split('\n').slice(0, 3).join(' ').substring(0, 280) ?? '',
              followUp1: match?.follow_up_1 ?? '',
              followUp2: match?.follow_up_2 ?? '',
              followUp3: match?.follow_up_3 ?? '',
              qualityScore: match?.quality_score ?? 0,
              flags: match?.flags ?? '',
              approved: false,
              timeline: [
                { id: generateId(), channel: 'linkedin' as OutreachChannel, action: 'LinkedIn Profile Researched', date: new Date().toISOString().split('T')[0], detail: 'Research completed' },
                { id: generateId(), channel: bl.channel, action: `${bl.channel === 'linkedin' ? 'LinkedIn DM' : 'Email'} Drafted`, date: new Date().toISOString().split('T')[0], detail: 'Draft generated via Campaign Orchestrator' },
              ],
            }
          }
          return { ...bl, status: 'drafted' as const, lastAction: 'Draft generated', lastActionDate: new Date().toISOString().split('T')[0] }
        })

        setLeads(prev => [...prev, ...updatedLeads])
        setBatchLeads([])
        setStatusMessage(`Successfully generated drafts for ${resultLeads.length} lead(s). Average quality: ${data?.average_quality_score ?? 'N/A'}. Navigate to Review Queue to review.`)
        setActiveScreen('review')
      } else {
        setErrorMessage(result?.error || 'Failed to generate drafts. Please try again.')
      }
    } catch (err) {
      setErrorMessage('An error occurred while generating drafts.')
    } finally {
      setLoading(false)
      setActiveAgentId(null)
    }
  }

  // ----- Send approved emails (Email Delivery Agent) -----
  const handleSendApproved = async () => {
    const approved = leads.filter(l => l.approved && l.status === 'drafted')
    if (approved.length === 0) {
      setErrorMessage('No approved drafts to send. Approve at least one email first.')
      return
    }
    clearMessages()
    setLoading(true)
    setActiveAgentId(EMAIL_DELIVERY_AGENT_ID)
    setSendResults([])
    setSendProgress(0)

    const allResults: EmailResult[] = []
    for (let i = 0; i < approved.length; i++) {
      const lead = approved[i]
      setSendProgress(Math.round(((i) / approved.length) * 100))
      setStatusMessage(`Sending email ${i + 1} of ${approved.length} to ${lead.name}...`)

      try {
        const message = `Send this email - To: ${lead.email}, Subject: ${lead.subjectLine ?? 'Outreach'}, Body: ${lead.emailBody ?? ''}`
        const result = await callAIAgent(message, EMAIL_DELIVERY_AGENT_ID)

        if (result.success) {
          const data = result?.response?.result
          const results = Array.isArray(data?.results) ? data.results : []
          if (results.length > 0) {
            allResults.push(...results)
          } else {
            allResults.push({ lead_name: lead.name, email: lead.email, status: 'success', timestamp: new Date().toISOString(), error: '' })
          }
          setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: 'sent' as const, lastAction: 'Email sent', lastActionDate: new Date().toISOString().split('T')[0], approved: false } : l))
        } else {
          allResults.push({ lead_name: lead.name, email: lead.email, status: 'failed', timestamp: new Date().toISOString(), error: result?.error ?? 'Unknown error' })
        }
      } catch {
        allResults.push({ lead_name: lead.name, email: lead.email, status: 'failed', timestamp: new Date().toISOString(), error: 'Network error' })
      }
    }

    setSendResults(allResults)
    setSendProgress(100)
    const succeeded = allResults.filter(r => r.status === 'success').length
    const failed = allResults.filter(r => r.status === 'failed').length
    setStatusMessage(`Sending complete. ${succeeded} sent, ${failed} failed.`)
    setLoading(false)
    setActiveAgentId(null)
  }

  // ----- Check engagement (Engagement Monitor Agent) -----
  const handleCheckEngagement = async () => {
    const sentLeads = leads.filter(l => ['sent', 'hot_lead', 'replied'].includes(l.status))
    if (sentLeads.length === 0) {
      setErrorMessage('No sent or active leads to check engagement for.')
      return
    }
    clearMessages()
    setLoading(true)
    setActiveAgentId(ENGAGEMENT_MONITOR_AGENT_ID)
    setStatusMessage('Checking Gmail for engagement signals...')

    try {
      const leadsPayload = sentLeads.map(l => ({ name: l.name, email: l.email, company: l.company }))
      const message = `Check Gmail for engagement signals from our outreach leads. Look for replies, link clicks, and flag any leads with no response after ${settings.followUpDays} days. Send Slack notifications for high-signal events to ${settings.slackChannel}. Here are the leads to check: ${JSON.stringify(leadsPayload)}`
      const result = await callAIAgent(message, ENGAGEMENT_MONITOR_AGENT_ID)

      if (result.success) {
        const data = result?.response?.result
        const results = Array.isArray(data?.engagement_results) ? data.engagement_results : []
        setEngagementResults(results)
        setEngagementSummary(data?.summary ?? '')
        setEngagementStats({
          hot_leads_count: data?.hot_leads_count ?? 0,
          follow_ups_due: data?.follow_ups_due ?? 0,
          notifications_sent: data?.notifications_sent ?? 0,
        })

        // Update lead statuses based on engagement
        for (const er of results) {
          if (er?.lead_name) {
            setLeads(prev => prev.map(l => {
              if (l.name.toLowerCase() === (er.lead_name ?? '').toLowerCase()) {
                const newStatus = er.signal_type === 'reply' ? 'replied' as const
                  : er.signal_type === 'link_click' || er.signal_type === 'open' ? 'hot_lead' as const
                  : l.status
                return {
                  ...l,
                  status: newStatus,
                  engagementSignal: er.signal_type ?? '',
                  daysSinceContact: er.days_since_contact ?? l.daysSinceContact,
                  lastAction: `Engagement: ${er.signal_type ?? 'checked'}`,
                  lastActionDate: new Date().toISOString().split('T')[0],
                }
              }
              return l
            }))
          }
        }
        setStatusMessage(`Engagement check complete. ${data?.hot_leads_count ?? 0} hot leads, ${data?.follow_ups_due ?? 0} follow-ups due.`)
      } else {
        setErrorMessage(result?.error || 'Failed to check engagement.')
      }
    } catch {
      setErrorMessage('An error occurred while checking engagement.')
    } finally {
      setLoading(false)
      setActiveAgentId(null)
    }
  }

  // ----- Navigation items -----
  const navItems: { key: Screen; icon: React.ReactNode; label: string }[] = [
    { key: 'dashboard', icon: <FiHome size={18} />, label: 'Dashboard' },
    { key: 'campaigns', icon: <FiTarget size={18} />, label: 'Campaigns' },
    { key: 'review', icon: <FiCheckSquare size={18} />, label: 'Review Queue' },
    { key: 'engagement', icon: <FiActivity size={18} />, label: 'Engagement' },
    { key: 'settings', icon: <FiSettings size={18} />, label: 'Settings' },
  ]

  // ----- Compute pipeline stats -----
  const totalLeads = leads.length
  const hotLeads = leads.filter(l => l.status === 'hot_lead').length
  const emailsSent = leads.filter(l => ['sent', 'hot_lead', 'replied', 'closed'].includes(l.status)).length
  const replied = leads.filter(l => l.status === 'replied').length
  const responseRate = emailsSent > 0 ? `${Math.round((replied / emailsSent) * 100)}%` : '0%'

  // ----- Engagement filter -----
  const filteredEngagement = engagementResults.filter(er => {
    if (engagementFilter === 'all') return true
    if (engagementFilter === 'hot') return er.signal_type === 'reply' || er.signal_type === 'link_click'
    if (engagementFilter === 'no_response') return er.signal_type === 'no_response' || er.status === 'no_response'
    if (engagementFilter === 'replied') return er.signal_type === 'reply'
    return true
  })

  // ----- Review leads (drafted) -----
  const draftedLeads = leads.filter(l => l.status === 'drafted')

  return (
    <ErrorBoundary>
      <TooltipProvider>
        <div className="min-h-screen font-sans" style={{ background: 'linear-gradient(135deg, hsl(30, 50%, 97%) 0%, hsl(20, 45%, 95%) 35%, hsl(40, 40%, 96%) 70%, hsl(15, 35%, 97%) 100%)', letterSpacing: '-0.01em', lineHeight: '1.55' }}>

          {/* ===== MOBILE MENU TOGGLE ===== */}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="fixed top-4 left-4 z-50 lg:hidden p-2 rounded-xl bg-white/80 backdrop-blur-[16px] border border-white/[0.18] shadow-md text-foreground">
            {sidebarOpen ? <FiX size={20} /> : <FiMenu size={20} />}
          </button>

          {/* ===== SIDEBAR ===== */}
          <aside className={cn("fixed top-0 left-0 h-full w-64 bg-white/75 backdrop-blur-[16px] border-r border-white/[0.18] shadow-md z-40 flex flex-col transition-transform duration-300 lg:translate-x-0", sidebarOpen ? 'translate-x-0' : '-translate-x-full')}>
            <div className="p-6 flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center"><FiZap className="text-primary-foreground" size={18} /></div>
              <span className="text-lg font-semibold tracking-tight text-foreground">Zaps</span>
            </div>
            <Separator className="mx-4 w-auto" />
            <nav className="flex-1 p-4 space-y-1">
              {navItems.map(item => (
                <button key={item.key} onClick={() => { setActiveScreen(item.key); setSidebarOpen(false); clearMessages() }} className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200", activeScreen === item.key ? 'bg-primary/10 text-primary shadow-sm' : 'text-muted-foreground hover:bg-secondary hover:text-foreground')}>
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </nav>
            <Separator className="mx-4 w-auto" />
            {/* Agent Status */}
            <div className="p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Agents</p>
              <div className="space-y-1.5">
                {[
                  { id: CAMPAIGN_ORCHESTRATOR_ID, name: 'Orchestrator', desc: 'Research & Draft' },
                  { id: EMAIL_DELIVERY_AGENT_ID, name: 'Email Delivery', desc: 'Gmail Send' },
                  { id: ENGAGEMENT_MONITOR_AGENT_ID, name: 'Engagement', desc: 'Monitor & Notify' },
                ].map(agent => (
                  <div key={agent.id} className="flex items-center gap-2 text-xs">
                    <div className={cn('w-1.5 h-1.5 rounded-full', activeAgentId === agent.id ? 'bg-green-500 animate-pulse' : 'bg-gray-300')} />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={cn('truncate', activeAgentId === agent.id ? 'text-foreground font-medium' : 'text-muted-foreground')}>{agent.name}</span>
                      </TooltipTrigger>
                      <TooltipContent><p>{agent.desc}</p></TooltipContent>
                    </Tooltip>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* ===== MAIN CONTENT ===== */}
          <main className="lg:ml-64 min-h-screen">
            <div className="p-4 lg:p-6 max-w-7xl mx-auto">

              {/* ===== TOP BAR ===== */}
              <div className="flex items-center justify-between mb-6 pt-10 lg:pt-0">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight text-foreground">{navItems.find(n => n.key === activeScreen)?.label}</h1>
                  <p className="text-sm text-muted-foreground mt-0.5">Lead Outreach Assistant</p>
                </div>
                <div className="flex items-center gap-3">
                  <Label htmlFor="sample-toggle" className="text-xs text-muted-foreground">Sample Data</Label>
                  <Switch id="sample-toggle" checked={sampleDataOn} onCheckedChange={setSampleDataOn} />
                </div>
              </div>

              {/* ===== STATUS / ERROR MESSAGES ===== */}
              {statusMessage && !errorMessage && (
                <Alert className="mb-4 bg-green-50/80 border-green-200">
                  <FiCheck className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-sm text-green-800">{statusMessage}</AlertDescription>
                </Alert>
              )}
              {errorMessage && (
                <Alert className="mb-4 bg-red-50/80 border-red-200" variant="destructive">
                  <FiAlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm">{errorMessage}</AlertDescription>
                </Alert>
              )}

              {/* ===== LOADING BAR ===== */}
              {loading && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FiRefreshCw className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">{statusMessage || 'Processing...'}</span>
                  </div>
                  <Progress value={sendProgress > 0 ? sendProgress : undefined} className="h-1.5" />
                </div>
              )}

              {/* ======================== */}
              {/* SCREEN: DASHBOARD        */}
              {/* ======================== */}
              {activeScreen === 'dashboard' && (
                <div className="space-y-6">
                  {/* Stat Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard icon={<FiUsers size={20} />} label="Total Leads" value={totalLeads} />
                    <StatCard icon={<FiTrendingUp size={20} />} label="Hot Leads" value={hotLeads} trend={hotLeads > 0 ? `${hotLeads} active` : undefined} />
                    <StatCard icon={<FiSend size={20} />} label="Emails Sent" value={emailsSent} />
                    <StatCard icon={<FiMail size={20} />} label="Response Rate" value={responseRate} />
                  </div>

                  {/* New Campaign Button */}
                  <div className="flex justify-end">
                    <Button onClick={() => setActiveScreen('campaigns')} className="gap-2 shadow-md">
                      <FiPlus size={16} />New Campaign
                    </Button>
                  </div>

                  {/* Pipeline Board */}
                  <Card className="bg-white/60 backdrop-blur-[16px] border border-white/[0.18] shadow-md">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base font-semibold">Lead Pipeline</CardTitle>
                      <CardDescription className="text-xs">Track leads through your outreach funnel</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="w-full">
                        <div className="flex gap-4 pb-4 min-w-max">
                          {[
                            { title: 'New', status: 'new' as const, color: 'bg-gray-400' },
                            { title: 'Researched', status: 'researched' as const, color: 'bg-blue-400' },
                            { title: 'Drafted', status: 'drafted' as const, color: 'bg-amber-400' },
                            { title: 'Sent', status: 'sent' as const, color: 'bg-sky-400' },
                            { title: 'Hot Lead', status: 'hot_lead' as const, color: 'bg-red-400' },
                            { title: 'Replied', status: 'replied' as const, color: 'bg-green-400' },
                            { title: 'Closed', status: 'closed' as const, color: 'bg-purple-400' },
                          ].map(col => (
                            <PipelineColumn
                              key={col.status}
                              title={col.title}
                              leads={getLeadsByStatus(col.status)}
                              color={col.color}
                              followUpDays={settings.followUpDays}
                              onAction={(lead, action) => {
                                if (action === 'research' || action === 'review') setActiveScreen('review')
                                else if (action === 'follow_up') setActiveScreen('engagement')
                                else if (action === 'view') {
                                  setSelectedEngagementLead(lead.name)
                                  setActiveScreen('engagement')
                                }
                              }}
                            />
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>

                  {/* Empty state */}
                  {leads.length === 0 && !sampleDataOn && (
                    <div className="text-center py-12">
                      <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4"><FiTarget className="text-primary" size={28} /></div>
                      <h3 className="text-lg font-semibold mb-2">No leads yet</h3>
                      <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">Start a new campaign to research leads, generate personalized outreach, and track engagement.</p>
                      <Button onClick={() => setActiveScreen('campaigns')} className="gap-2"><FiPlus size={16} />Start Your First Campaign</Button>
                    </div>
                  )}
                </div>
              )}

              {/* ======================== */}
              {/* SCREEN: CAMPAIGNS        */}
              {/* ======================== */}
              {activeScreen === 'campaigns' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Single Lead Form */}
                    <Card className="bg-white/75 backdrop-blur-[16px] border border-white/[0.18] shadow-md">
                      <CardHeader>
                        <CardTitle className="text-base font-semibold flex items-center gap-2"><FiUser size={16} />Add Lead</CardTitle>
                        <CardDescription className="text-xs">Enter lead details individually</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="lead-name" className="text-xs font-medium">Lead Name <span className="text-destructive">*</span></Label>
                          <Input id="lead-name" placeholder="e.g. Jane Smith" value={leadForm.name} onChange={(e) => setLeadForm(prev => ({ ...prev, name: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="lead-company" className="text-xs font-medium">Company</Label>
                          <Input id="lead-company" placeholder="e.g. Acme Corp" value={leadForm.company} onChange={(e) => setLeadForm(prev => ({ ...prev, company: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="lead-url" className="text-xs font-medium">Company URL</Label>
                          <div className="relative">
                            <FiGlobe className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                            <Input id="lead-url" type="url" placeholder="https://company.com" className="pl-9" value={leadForm.companyUrl} onChange={(e) => setLeadForm(prev => ({ ...prev, companyUrl: e.target.value }))} />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="lead-linkedin" className="text-xs font-medium">LinkedIn URL</Label>
                          <div className="relative">
                            <FiLinkedin className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                            <Input id="lead-linkedin" type="url" placeholder="https://linkedin.com/in/username" className="pl-9" value={leadForm.linkedinUrl} onChange={(e) => setLeadForm(prev => ({ ...prev, linkedinUrl: e.target.value }))} />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="lead-email" className="text-xs font-medium">Email <span className="text-destructive">*</span></Label>
                          <div className="relative">
                            <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                            <Input id="lead-email" type="email" placeholder="jane@company.com" className="pl-9" value={leadForm.email} onChange={(e) => setLeadForm(prev => ({ ...prev, email: e.target.value }))} />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-medium">Outreach Channel</Label>
                          <div className="flex gap-2">
                            <Button type="button" variant={leadForm.channel === 'email' ? 'default' : 'outline'} size="sm" className="flex-1 gap-1.5 h-9" onClick={() => setLeadForm(prev => ({ ...prev, channel: 'email' }))}>
                              <FiMail size={14} />Email
                            </Button>
                            <Button type="button" variant={leadForm.channel === 'linkedin' ? 'default' : 'outline'} size="sm" className={cn("flex-1 gap-1.5 h-9", leadForm.channel === 'linkedin' && 'bg-[#0A66C2] hover:bg-[#004182]')} onClick={() => setLeadForm(prev => ({ ...prev, channel: 'linkedin' }))}>
                              <FiLinkedin size={14} />LinkedIn
                            </Button>
                          </div>
                        </div>
                        <Button onClick={handleAddLead} className="w-full gap-2" disabled={!leadForm.name.trim() || !leadForm.email.trim()}>
                          <FiPlus size={16} />Add to Batch
                        </Button>
                      </CardContent>
                    </Card>

                    {/* Bulk Input */}
                    <Card className="bg-white/75 backdrop-blur-[16px] border border-white/[0.18] shadow-md">
                      <CardHeader>
                        <CardTitle className="text-base font-semibold flex items-center gap-2"><FiUsers size={16} />Bulk Import</CardTitle>
                        <CardDescription className="text-xs">Paste multiple leads (CSV: Name, Company, CompanyURL, LinkedInURL, Email, Channel)</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <Textarea placeholder={"Jane Smith, Acme Corp, https://acme.com, https://linkedin.com/in/jane, jane@acme.com, email\nJohn Doe, Beta Inc, https://beta.io, https://linkedin.com/in/john, john@beta.io, linkedin"} value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={8} className="text-sm" />
                        <Button onClick={handleParseBulk} variant="secondary" className="w-full gap-2" disabled={!bulkText.trim()}>
                          <FiCopy size={14} />Parse & Add Leads
                        </Button>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Batch Lead Table */}
                  {batchLeads.length > 0 && (
                    <Card className="bg-white/75 backdrop-blur-[16px] border border-white/[0.18] shadow-md">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-base font-semibold">Batch Queue</CardTitle>
                            <CardDescription className="text-xs">{batchLeads.length} lead(s) ready for outreach generation</CardDescription>
                          </div>
                          <Badge variant="secondary" className="text-xs">{batchLeads.length} leads</Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="max-h-[300px]">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Name</TableHead>
                                <TableHead className="text-xs">Company</TableHead>
                                <TableHead className="text-xs">Email</TableHead>
                                <TableHead className="text-xs w-[70px]">Channel</TableHead>
                                <TableHead className="text-xs w-[60px]">Remove</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {batchLeads.map(lead => (
                                <TableRow key={lead.id}>
                                  <TableCell className="text-sm font-medium">{lead.name}</TableCell>
                                  <TableCell className="text-sm text-muted-foreground">{lead.company}</TableCell>
                                  <TableCell className="text-sm text-muted-foreground">{lead.email}</TableCell>
                                  <TableCell><div className="flex items-center justify-center"><ChannelIcon channel={lead.channel} size={15} /></div></TableCell>
                                  <TableCell>
                                    <Button variant="ghost" size="sm" onClick={() => setBatchLeads(prev => prev.filter(l => l.id !== lead.id))} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
                                      <FiTrash2 size={14} />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                        <div className="mt-4 flex justify-end">
                          <Button onClick={handleGenerateDrafts} disabled={loading || batchLeads.length === 0} className="gap-2 shadow-md">
                            {loading && activeAgentId === CAMPAIGN_ORCHESTRATOR_ID ? <FiRefreshCw className="animate-spin" size={16} /> : <FiSearch size={16} />}
                            Generate Outreach Drafts
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Empty state */}
                  {batchLeads.length === 0 && (
                    <div className="text-center py-8">
                      <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3"><FiTarget className="text-primary" size={22} /></div>
                      <p className="text-sm text-muted-foreground">Add leads above to begin your outreach campaign.</p>
                    </div>
                  )}
                </div>
              )}

              {/* ======================== */}
              {/* SCREEN: REVIEW QUEUE     */}
              {/* ======================== */}
              {activeScreen === 'review' && (
                <div className="space-y-6">
                  {/* Controls */}
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className="text-xs">{draftedLeads.length} draft(s)</Badge>
                      {draftedLeads.length > 0 && (
                        <div className="flex items-center gap-2">
                          <Checkbox id="batch-approve" checked={draftedLeads.length > 0 && draftedLeads.every(l => l.approved)} onCheckedChange={(checked) => {
                            setLeads(prev => prev.map(l => l.status === 'drafted' ? { ...l, approved: !!checked } : l))
                          }} />
                          <Label htmlFor="batch-approve" className="text-xs text-muted-foreground cursor-pointer">Approve All</Label>
                        </div>
                      )}
                    </div>
                    <Button onClick={handleSendApproved} disabled={loading || draftedLeads.filter(l => l.approved).length === 0} className="gap-2 shadow-md">
                      {loading && activeAgentId === EMAIL_DELIVERY_AGENT_ID ? <FiRefreshCw className="animate-spin" size={16} /> : <FiSend size={16} />}
                      Send Approved ({draftedLeads.filter(l => l.approved).length})
                    </Button>
                  </div>

                  {/* Send Results */}
                  {sendResults.length > 0 && (
                    <Card className="bg-white/75 backdrop-blur-[16px] border border-white/[0.18] shadow-md">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-semibold">Send Results</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {sendResults.map((sr, idx) => (
                            <div key={idx} className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/50 text-sm">
                              <div className="flex items-center gap-2">
                                {sr.status === 'success' ? <FiCheck className="text-green-600" size={14} /> : <FiX className="text-red-500" size={14} />}
                                <span className="font-medium">{sr.lead_name ?? 'Unknown'}</span>
                                <span className="text-muted-foreground text-xs">{sr.email ?? ''}</span>
                              </div>
                              <StatusBadge status={sr.status ?? 'unknown'} />
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* SPLIT PANE: Draft Cards (left) + Research Panel (right) */}
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                    {/* LEFT: Draft Cards */}
                    <div className="lg:col-span-3">
                      <ScrollArea className="max-h-[calc(100vh-280px)]">
                        <div className="space-y-4">
                          {draftedLeads.map(lead => {
                            const tags = extractResearchTags(lead.researchSummary ?? '', lead)
                            const isSelected = reviewSelectedId === lead.id
                            return (
                              <Card
                                key={lead.id}
                                className={cn(
                                  "bg-white/75 backdrop-blur-[16px] border shadow-md transition-all duration-200 cursor-pointer",
                                  lead.approved ? 'border-green-300 ring-1 ring-green-200' : isSelected ? 'border-primary ring-1 ring-primary/30' : 'border-white/[0.18]'
                                )}
                                onClick={() => setReviewSelectedId(isSelected ? null : lead.id)}
                              >
                                <CardContent className="p-5">
                                  <div className="flex items-start justify-between mb-4">
                                    <div>
                                      <div className="flex items-center gap-2 mb-1">
                                        <h3 className="text-sm font-semibold">{lead.name}</h3>
                                        <Badge variant="outline" className="text-xs">{lead.company}</Badge>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Badge variant="outline" className={cn("text-xs gap-1", lead.channel === 'linkedin' ? 'bg-blue-50 text-[#0A66C2] border-blue-200' : 'bg-orange-50 text-primary border-orange-200')}>
                                              <ChannelIcon channel={lead.channel} size={10} />
                                              {lead.channel === 'linkedin' ? 'LinkedIn' : 'Email'}
                                            </Badge>
                                          </TooltipTrigger>
                                          <TooltipContent><p>Primary outreach channel</p></TooltipContent>
                                        </Tooltip>
                                        {(lead.qualityScore ?? 0) > 0 && (
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Badge className={cn("text-xs", (lead.qualityScore ?? 0) >= 80 ? 'bg-green-100 text-green-700 border-green-200' : (lead.qualityScore ?? 0) >= 60 ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-gray-100 text-gray-600 border-gray-200')} variant="outline">
                                                <FiStar size={10} className="mr-1" />{lead.qualityScore}
                                              </Badge>
                                            </TooltipTrigger>
                                            <TooltipContent><p>Quality Score: {lead.qualityScore}/100</p></TooltipContent>
                                          </Tooltip>
                                        )}
                                        {lead.flags && <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">{lead.flags}</Badge>}
                                      </div>
                                      <p className="text-xs text-muted-foreground">{lead.email}</p>
                                    </div>
                                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                      <Checkbox checked={lead.approved ?? false} onCheckedChange={(checked) => setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, approved: !!checked } : l))} />
                                      <Button variant="ghost" size="sm" onClick={() => setEditingLeadId(editingLeadId === lead.id ? null : lead.id)} className="h-8 w-8 p-0">
                                        <FiEdit2 size={14} />
                                      </Button>
                                      <Button variant="ghost" size="sm" onClick={() => setLeads(prev => prev.filter(l => l.id !== lead.id))} className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive">
                                        <FiTrash2 size={14} />
                                      </Button>
                                    </div>
                                  </div>

                                  {/* Subject + Body with highlighting */}
                                  <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                                    <div>
                                      <Label className="text-xs font-medium text-muted-foreground mb-1 block flex items-center gap-1"><FiMail size={11} />Subject Line</Label>
                                      {editingLeadId === lead.id ? (
                                        <Input value={lead.subjectLine ?? ''} onChange={(e) => setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, subjectLine: e.target.value } : l))} className="text-sm" />
                                      ) : (
                                        <p className="text-sm font-medium bg-secondary/30 rounded-lg px-3 py-2">{highlightDraftText(lead.subjectLine ?? 'No subject', tags)}</p>
                                      )}
                                    </div>
                                    <div>
                                      <Label className="text-xs font-medium text-muted-foreground mb-1 block flex items-center gap-1"><FiMail size={11} />Email Body</Label>
                                      {editingLeadId === lead.id ? (
                                        <Textarea value={lead.emailBody ?? ''} onChange={(e) => setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, emailBody: e.target.value } : l))} rows={6} className="text-sm" />
                                      ) : (
                                        <div className="text-sm bg-secondary/30 rounded-lg px-3 py-2 whitespace-pre-wrap leading-relaxed">{highlightDraftText(lead.emailBody ?? 'No email body', tags)}</div>
                                      )}
                                    </div>
                                  </div>

                                  {/* LinkedIn Message with Copy to Clipboard */}
                                  {(lead.linkedinMessage || editingLeadId === lead.id) && (
                                    <div className="mt-3 p-4 bg-blue-50/50 border border-blue-100 rounded-xl" onClick={(e) => e.stopPropagation()}>
                                      <div className="flex items-center justify-between mb-2">
                                        <Label className="text-xs font-medium text-[#0A66C2] flex items-center gap-1.5">
                                          <FiLinkedin size={13} />
                                          LinkedIn DM Draft
                                        </Label>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-8 gap-1.5 text-xs px-3 border-[#0A66C2]/30 text-[#0A66C2] hover:bg-[#0A66C2]/5 font-medium"
                                          onClick={async () => {
                                            const ok = await copyToClipboard(lead.linkedinMessage ?? '')
                                            if (ok) { setCopiedId(`review-li-${lead.id}`); setTimeout(() => setCopiedId(null), 2000) }
                                          }}
                                        >
                                          {copiedId === `review-li-${lead.id}` ? <><FiCheck size={13} className="text-green-600" /><span className="text-green-600">Copied</span></> : <><FiCopy size={13} />Copy to Clipboard</>}
                                        </Button>
                                      </div>
                                      {editingLeadId === lead.id ? (
                                        <Textarea value={lead.linkedinMessage ?? ''} onChange={(e) => setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, linkedinMessage: e.target.value } : l))} rows={3} className="text-sm bg-white/80 border-blue-200" placeholder="Enter LinkedIn DM text..." />
                                      ) : (
                                        <div className="text-sm bg-white/60 rounded-lg px-3 py-2 whitespace-pre-wrap border border-blue-100/50">{highlightDraftText(lead.linkedinMessage ?? 'No LinkedIn message', tags)}</div>
                                      )}
                                      <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1"><FiInfo size={10} />Copy and paste into LinkedIn DM for manual sending</p>
                                    </div>
                                  )}

                                  {/* Follow-ups */}
                                  {(lead.followUp1 || lead.followUp2 || lead.followUp3) && (
                                    <Tabs defaultValue="fu1" className="mt-4" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                                      <TabsList className="h-8">
                                        {lead.followUp1 && <TabsTrigger value="fu1" className="text-xs px-3 h-7">Follow-up 1</TabsTrigger>}
                                        {lead.followUp2 && <TabsTrigger value="fu2" className="text-xs px-3 h-7">Follow-up 2</TabsTrigger>}
                                        {lead.followUp3 && <TabsTrigger value="fu3" className="text-xs px-3 h-7">Follow-up 3</TabsTrigger>}
                                      </TabsList>
                                      {lead.followUp1 && <TabsContent value="fu1" className="mt-2"><div className="text-sm bg-secondary/30 rounded-lg px-3 py-2 whitespace-pre-wrap">{lead.followUp1}</div></TabsContent>}
                                      {lead.followUp2 && <TabsContent value="fu2" className="mt-2"><div className="text-sm bg-secondary/30 rounded-lg px-3 py-2 whitespace-pre-wrap">{lead.followUp2}</div></TabsContent>}
                                      {lead.followUp3 && <TabsContent value="fu3" className="mt-2"><div className="text-sm bg-secondary/30 rounded-lg px-3 py-2 whitespace-pre-wrap">{lead.followUp3}</div></TabsContent>}
                                    </Tabs>
                                  )}
                                </CardContent>
                              </Card>
                            )
                          })}
                        </div>
                      </ScrollArea>
                    </div>

                    {/* RIGHT: Persistent Research Panel */}
                    <div className="lg:col-span-2">
                      <Card className="bg-white/75 backdrop-blur-[16px] border border-white/[0.18] shadow-md sticky top-6">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <FiDatabase size={14} className="text-primary" />
                            Perplexity Research Intel
                          </CardTitle>
                          <CardDescription className="text-xs">Click a draft card to view extracted research data</CardDescription>
                        </CardHeader>
                        <CardContent>
                          {(() => {
                            const selectedLead = reviewSelectedId ? draftedLeads.find(l => l.id === reviewSelectedId) : null
                            if (!selectedLead) {
                              return (
                                <div className="text-center py-10">
                                  <FiSearch className="mx-auto text-muted-foreground mb-3" size={24} />
                                  <p className="text-sm font-medium text-muted-foreground">Select a draft to view research</p>
                                  <p className="text-xs text-muted-foreground mt-1">Extracted data points and personalization variables will appear here</p>
                                </div>
                              )
                            }

                            const tags = extractResearchTags(selectedLead.researchSummary ?? '', selectedLead)

                            return (
                              <div className="space-y-5">
                                {/* Lead header */}
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/10 flex items-center justify-center text-xs font-bold text-primary/80">
                                    {selectedLead.company?.split(/\s+/).map(w => w[0]).join('').substring(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold">{selectedLead.name}</p>
                                    <p className="text-xs text-muted-foreground">{selectedLead.company} &middot; {selectedLead.email}</p>
                                  </div>
                                </div>

                                <Separator />

                                {/* Extracted Research Tags */}
                                <div>
                                  <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider flex items-center gap-1.5">
                                    <FiLayers size={11} />Extracted Data Points
                                  </p>
                                  {tags.length > 0 ? (
                                    <div className="space-y-2">
                                      {tags.map((tag, i) => (
                                        <div key={i} className={cn("flex items-start gap-2 px-3 py-2 rounded-lg border", tagCategoryStyle(tag.category))}>
                                          <div className="mt-0.5 flex-shrink-0">{tagCategoryIcon(tag.category)}</div>
                                          <div className="min-w-0">
                                            <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{tag.label}</p>
                                            <p className="text-xs font-medium leading-snug">{tag.value}</p>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-muted-foreground italic">No structured data points extracted. The research summary may contain unstructured insights.</p>
                                  )}
                                </div>

                                {/* Highlight Legend */}
                                {tags.length > 0 && (
                                  <div className="px-3 py-2 bg-amber-50/60 border border-amber-100 rounded-lg">
                                    <p className="text-[10px] font-semibold text-amber-700 flex items-center gap-1 mb-1"><FiInfo size={9} />PERSONALIZATION HIGHLIGHTS</p>
                                    <p className="text-[11px] text-amber-600">Highlighted text in the draft shows where Perplexity research was injected. These dynamic variables make the outreach feel personal.</p>
                                  </div>
                                )}

                                <Separator />

                                {/* Full Research Summary */}
                                <div>
                                  <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider flex items-center gap-1.5">
                                    <FiSearch size={11} />Full Research Summary
                                  </p>
                                  <div className="text-sm text-muted-foreground bg-secondary/20 rounded-lg p-3 leading-relaxed">
                                    {renderMarkdown(selectedLead.researchSummary ?? 'No research data available.')}
                                  </div>
                                </div>

                                {/* Quality & Links */}
                                <div className="flex items-center gap-3 flex-wrap">
                                  {(selectedLead.qualityScore ?? 0) > 0 && (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[10px] text-muted-foreground">Quality:</span>
                                      <Badge className={cn("text-xs", (selectedLead.qualityScore ?? 0) >= 80 ? 'bg-green-100 text-green-700 border-green-200' : 'bg-amber-100 text-amber-700 border-amber-200')} variant="outline">
                                        <FiStar size={9} className="mr-1" />{selectedLead.qualityScore}/100
                                      </Badge>
                                    </div>
                                  )}
                                  {selectedLead.linkedinUrl && (
                                    <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 px-2 text-[#0A66C2]" onClick={() => window.open(selectedLead.linkedinUrl, '_blank')}>
                                      <FiLinkedin size={10} />Profile
                                    </Button>
                                  )}
                                  {selectedLead.companyUrl && (
                                    <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 px-2 text-muted-foreground" onClick={() => window.open(selectedLead.companyUrl, '_blank')}>
                                      <FiGlobe size={10} />Website
                                    </Button>
                                  )}
                                </div>
                              </div>
                            )
                          })()}
                        </CardContent>
                      </Card>
                    </div>
                  </div>

                  {/* Empty state */}
                  {draftedLeads.length === 0 && (
                    <div className="text-center py-12">
                      <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4"><FiCheckSquare className="text-primary" size={28} /></div>
                      <h3 className="text-lg font-semibold mb-2">No drafts to review</h3>
                      <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">Generate outreach drafts from the Campaigns screen, then review and approve them here.</p>
                      <Button onClick={() => setActiveScreen('campaigns')} variant="secondary" className="gap-2"><FiArrowRight size={14} />Go to Campaigns</Button>
                    </div>
                  )}
                </div>
              )}

              {/* ======================== */}
              {/* SCREEN: ENGAGEMENT       */}
              {/* ======================== */}
              {activeScreen === 'engagement' && (
                <div className="space-y-6">
                  {/* Top Stats */}
                  {(engagementResults.length > 0 || sampleDataOn) && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <StatCard icon={<FiTrendingUp size={20} />} label="Hot Leads" value={sampleDataOn && engagementResults.length === 0 ? 2 : engagementStats.hot_leads_count} />
                      <StatCard icon={<FiClock size={20} />} label="Follow-ups Due" value={sampleDataOn && engagementResults.length === 0 ? 1 : engagementStats.follow_ups_due} />
                      <StatCard icon={<FiSlack size={20} />} label="Notifications Sent" value={sampleDataOn && engagementResults.length === 0 ? 3 : engagementStats.notifications_sent} />
                    </div>
                  )}

                  {/* Filters + Check button */}
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2">
                      <FiFilter size={14} className="text-muted-foreground" />
                      {['all', 'hot', 'no_response', 'replied'].map(f => (
                        <Button key={f} variant={engagementFilter === f ? 'default' : 'outline'} size="sm" onClick={() => setEngagementFilter(f)} className="text-xs h-7 capitalize">
                          {f === 'no_response' ? 'No Response' : f === 'hot' ? 'Hot Leads' : f}
                        </Button>
                      ))}
                    </div>
                    <Button onClick={handleCheckEngagement} disabled={loading} className="gap-2 shadow-md">
                      {loading && activeAgentId === ENGAGEMENT_MONITOR_AGENT_ID ? <FiRefreshCw className="animate-spin" size={16} /> : <FiActivity size={16} />}
                      Check Engagement
                    </Button>
                  </div>

                  {/* Summary */}
                  {engagementSummary && (
                    <Card className="bg-white/75 backdrop-blur-[16px] border border-white/[0.18] shadow-md">
                      <CardContent className="p-5">
                        <div className="flex items-start gap-2">
                          <FiInfo size={16} className="text-primary mt-0.5 flex-shrink-0" />
                          <div className="text-sm">{renderMarkdown(engagementSummary)}</div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Engagement Table + Detail Panel */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                      <Card className="bg-white/75 backdrop-blur-[16px] border border-white/[0.18] shadow-md">
                        <CardContent className="p-0">
                          <ScrollArea className="max-h-[500px]">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-xs">Lead</TableHead>
                                  <TableHead className="text-xs">Company</TableHead>
                                  <TableHead className="text-xs w-[60px]">Channel</TableHead>
                                  <TableHead className="text-xs">Status</TableHead>
                                  <TableHead className="text-xs">Signal</TableHead>
                                  <TableHead className="text-xs">Days</TableHead>
                                  <TableHead className="text-xs w-[50px]"></TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {/* Show from engagement results if available, otherwise from leads */}
                                {(engagementResults.length > 0 ? filteredEngagement : (sampleDataOn ? leads.filter(l => ['sent', 'hot_lead', 'replied'].includes(l.status)).map(l => ({ lead_name: l.name, company: l.company, status: l.status, signal_type: l.engagementSignal ?? 'no_response', channel: l.channel, follow_up_draft: '', days_since_contact: l.daysSinceContact ?? 0 })) : [])).map((er, idx) => (
                                  <TableRow key={idx} className={cn("cursor-pointer hover:bg-secondary/30 transition-colors", selectedEngagementLead === (er.lead_name ?? '') ? 'bg-primary/5' : '')} onClick={() => setSelectedEngagementLead(er.lead_name ?? '')}>
                                    <TableCell className="text-sm font-medium">{er.lead_name ?? 'Unknown'}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">{er.company ?? ''}</TableCell>
                                    <TableCell>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div className="flex items-center justify-center">
                                            <ChannelIcon channel={er.channel ?? (leads.find(l => l.name === er.lead_name)?.channel)} size={16} />
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent><p>{(er.channel ?? leads.find(l => l.name === er.lead_name)?.channel) === 'linkedin' ? 'LinkedIn' : 'Email'}</p></TooltipContent>
                                      </Tooltip>
                                    </TableCell>
                                    <TableCell><StatusBadge status={er.status ?? ''} /></TableCell>
                                    <TableCell><StatusBadge status={er.signal_type ?? ''} /></TableCell>
                                    <TableCell className="text-sm text-muted-foreground">{er.days_since_contact ?? '-'}d</TableCell>
                                    <TableCell><FiChevronRight size={14} className="text-muted-foreground" /></TableCell>
                                  </TableRow>
                                ))}
                                {engagementResults.length === 0 && !sampleDataOn && (
                                  <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">
                                      Click "Check Engagement" to scan for signals
                                    </TableCell>
                                  </TableRow>
                                )}
                              </TableBody>
                            </Table>
                          </ScrollArea>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Detail Panel */}
                    <div>
                      <Card className="bg-white/75 backdrop-blur-[16px] border border-white/[0.18] shadow-md sticky top-6">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-semibold">Lead Details</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {selectedEngagementLead ? (() => {
                            const er = engagementResults.find(e => e.lead_name === selectedEngagementLead)
                            const lead = leads.find(l => l.name === selectedEngagementLead)
                            const leadChannel = er?.channel ?? lead?.channel ?? 'email'
                            const timelineEvents = lead?.timeline ?? []
                            return (
                              <div className="space-y-4">
                                <div className="flex items-start justify-between">
                                  <div>
                                    <p className="text-base font-semibold">{selectedEngagementLead}</p>
                                    <p className="text-xs text-muted-foreground">{er?.company ?? lead?.company ?? ''}</p>
                                  </div>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="h-7 w-7 rounded-lg bg-secondary flex items-center justify-center">
                                        <ChannelIcon channel={leadChannel} size={14} />
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent><p>Primary: {leadChannel === 'linkedin' ? 'LinkedIn' : 'Email'}</p></TooltipContent>
                                  </Tooltip>
                                </div>
                                <Separator />
                                <div className="space-y-3">
                                  <div className="flex items-center gap-3">
                                    <div>
                                      <p className="text-xs font-medium text-muted-foreground mb-1">Status</p>
                                      <StatusBadge status={er?.status ?? lead?.status ?? ''} />
                                    </div>
                                    <div>
                                      <p className="text-xs font-medium text-muted-foreground mb-1">Signal</p>
                                      <StatusBadge status={er?.signal_type ?? lead?.engagementSignal ?? ''} />
                                    </div>
                                  </div>
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-1">Days Since Contact</p>
                                    <p className="text-sm">{er?.days_since_contact ?? lead?.daysSinceContact ?? '-'} day(s)</p>
                                  </div>
                                  {er?.follow_up_draft && (
                                    <div>
                                      <div className="flex items-center justify-between mb-1">
                                        <p className="text-xs font-medium text-muted-foreground">Suggested Follow-up</p>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 gap-1.5 text-xs px-2"
                                          onClick={async (e) => {
                                            e.stopPropagation()
                                            const ok = await copyToClipboard(er.follow_up_draft ?? '')
                                            if (ok) { setCopiedId(`eng-fu-${selectedEngagementLead}`); setTimeout(() => setCopiedId(null), 2000) }
                                          }}
                                        >
                                          {copiedId === `eng-fu-${selectedEngagementLead}` ? <><FiCheck size={12} className="text-green-600" /><span className="text-green-600">Copied</span></> : <><FiCopy size={12} />Copy</>}
                                        </Button>
                                      </div>
                                      <div className="text-sm bg-secondary/30 rounded-lg px-3 py-2 whitespace-pre-wrap">{er.follow_up_draft}</div>
                                    </div>
                                  )}
                                  {/* LinkedIn message copy for LinkedIn-channel leads */}
                                  {lead?.linkedinMessage && (
                                    <div>
                                      <div className="flex items-center justify-between mb-1">
                                        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><FiLinkedin size={11} className="text-[#0A66C2]" />LinkedIn Message</p>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-7 gap-1.5 text-xs px-2.5 border-[#0A66C2]/30 text-[#0A66C2] hover:bg-[#0A66C2]/5"
                                          onClick={async (e) => {
                                            e.stopPropagation()
                                            const ok = await copyToClipboard(lead.linkedinMessage ?? '')
                                            if (ok) { setCopiedId(`eng-li-${lead.id}`); setTimeout(() => setCopiedId(null), 2000) }
                                          }}
                                        >
                                          {copiedId === `eng-li-${lead.id}` ? <><FiCheck size={12} className="text-green-600" /><span className="text-green-600">Copied</span></> : <><FiCopy size={12} />Copy to Clipboard</>}
                                        </Button>
                                      </div>
                                      <div className="text-sm bg-blue-50/60 border border-blue-100 rounded-lg px-3 py-2 whitespace-pre-wrap">{lead.linkedinMessage}</div>
                                    </div>
                                  )}
                                </div>
                                {/* Cross-channel Timeline */}
                                <Separator />
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-3">Cross-Channel Timeline</p>
                                  {timelineEvents.length > 0 ? (
                                    <div className="relative">
                                      {/* Vertical line */}
                                      <div className="absolute left-[9px] top-1 bottom-1 w-px bg-border" />
                                      <div className="space-y-3">
                                        {timelineEvents.map((evt, eIdx) => (
                                          <div key={evt.id || eIdx} className="flex items-start gap-3 relative">
                                            <div className={cn('w-[19px] h-[19px] rounded-full border-2 flex items-center justify-center flex-shrink-0 z-10', evt.channel === 'linkedin' ? 'border-[#0A66C2] bg-blue-50' : 'border-primary bg-orange-50')}>
                                              {evt.channel === 'linkedin' ? <FiLinkedin size={9} className="text-[#0A66C2]" /> : <FiMail size={9} className="text-primary" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <p className="text-xs font-medium leading-tight">{evt.action}</p>
                                              <p className="text-[11px] text-muted-foreground">{evt.date}{evt.detail ? ` - ${evt.detail}` : ''}</p>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-start gap-2">
                                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                                      <div>
                                        <p className="text-xs font-medium">{lead?.lastAction ?? 'No activity'}</p>
                                        <p className="text-xs text-muted-foreground">{lead?.lastActionDate ?? ''}</p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })() : (
                            <div className="text-center py-8">
                              <FiEye className="mx-auto text-muted-foreground mb-2" size={20} />
                              <p className="text-xs text-muted-foreground">Select a lead to view details</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </div>
              )}

              {/* ======================== */}
              {/* SCREEN: SETTINGS         */}
              {/* ======================== */}
              {activeScreen === 'settings' && (
                <div className="max-w-4xl space-y-6">
                  {/* Settings Tabs */}
                  <div className="flex gap-1 bg-white/60 backdrop-blur-[16px] border border-white/[0.18] rounded-xl p-1 shadow-sm w-fit">
                    {[
                      { key: 'general' as const, icon: <FiSettings size={14} />, label: 'General' },
                      { key: 'senders' as const, icon: <FiInbox size={14} />, label: 'Sender Accounts' },
                      { key: 'followup' as const, icon: <FiClock size={14} />, label: 'Follow-up Rules' },
                    ].map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => setSettingsTab(tab.key)}
                        className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all", settingsTab === tab.key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50')}
                      >
                        {tab.icon}{tab.label}
                      </button>
                    ))}
                  </div>

                  {/* ---- TAB: General ---- */}
                  {settingsTab === 'general' && (
                    <div className="space-y-6">
                      {/* Notification Settings */}
                      <Card className="bg-white/75 backdrop-blur-[16px] border border-white/[0.18] shadow-md">
                        <CardHeader>
                          <CardTitle className="text-base font-semibold flex items-center gap-2"><FiSlack size={16} />Notification Settings</CardTitle>
                          <CardDescription className="text-xs">Configure where engagement alerts are sent</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="slack-channel" className="text-xs font-medium">Slack Channel</Label>
                            <div className="relative">
                              <FiHash className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                              <Input id="slack-channel" placeholder="#sales-alerts" className="pl-9" value={settings.slackChannel} onChange={(e) => setSettings(prev => ({ ...prev, slackChannel: e.target.value }))} />
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Brand Voice */}
                      <Card className="bg-white/75 backdrop-blur-[16px] border border-white/[0.18] shadow-md">
                        <CardHeader>
                          <CardTitle className="text-base font-semibold flex items-center gap-2"><FiMessageSquare size={16} />Brand Voice</CardTitle>
                          <CardDescription className="text-xs">Set the tone for generated email copy</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="flex gap-3">
                            <Button variant={settings.brandVoice === 'founder' ? 'default' : 'outline'} onClick={() => setSettings(prev => ({ ...prev, brandVoice: 'founder' }))} className="flex-1 gap-2">
                              <FiUser size={14} />Founder
                            </Button>
                            <Button variant={settings.brandVoice === 'professional' ? 'default' : 'outline'} onClick={() => setSettings(prev => ({ ...prev, brandVoice: 'professional' }))} className="flex-1 gap-2">
                              <FiUsers size={14} />Professional
                            </Button>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Email Signature */}
                      <Card className="bg-white/75 backdrop-blur-[16px] border border-white/[0.18] shadow-md">
                        <CardHeader>
                          <CardTitle className="text-base font-semibold flex items-center gap-2"><FiEdit2 size={16} />Email Signature</CardTitle>
                          <CardDescription className="text-xs">Appended to all outgoing emails</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <Textarea value={settings.emailSignature} onChange={(e) => setSettings(prev => ({ ...prev, emailSignature: e.target.value }))} rows={4} className="text-sm font-mono" />
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {/* ---- TAB: Sender Accounts ---- */}
                  {settingsTab === 'senders' && (
                    <div className="space-y-6">
                      {/* Overview Stats */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <StatCard icon={<FiInbox size={20} />} label="Active Accounts" value={senderAccounts.filter(s => s.active).length} />
                        <StatCard icon={<FiSend size={20} />} label="Sent Today" value={senderAccounts.reduce((acc, s) => acc + s.sentToday, 0)} />
                        <StatCard icon={<FiShield size={20} />} label="Avg Health Score" value={`${Math.round(senderAccounts.filter(s => s.active).reduce((acc, s) => acc + s.healthScore, 0) / Math.max(senderAccounts.filter(s => s.active).length, 1))}%`} />
                      </div>

                      {/* Sender Accounts Table */}
                      <Card className="bg-white/75 backdrop-blur-[16px] border border-white/[0.18] shadow-md">
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <div>
                              <CardTitle className="text-base font-semibold flex items-center gap-2"><FiServer size={16} />Connected Inboxes</CardTitle>
                              <CardDescription className="text-xs">Manage sending accounts for email rotation</CardDescription>
                            </div>
                            <Button variant="outline" className="gap-2 text-xs h-9" onClick={() => {
                              const newId = Math.random().toString(36).substring(2, 8)
                              setSenderAccounts(prev => [...prev, {
                                id: newId,
                                email: `new-sender-${newId}@zaps.io`,
                                displayName: 'New Sender',
                                dailyLimit: 30,
                                sentToday: 0,
                                healthScore: 100,
                                active: false,
                                provider: 'smtp',
                              }])
                            }}>
                              <FiPlus size={14} />Connect New SMTP/Google Workspace
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Account</TableHead>
                                <TableHead className="text-xs">Provider</TableHead>
                                <TableHead className="text-xs w-[100px]">Daily Limit</TableHead>
                                <TableHead className="text-xs w-[100px]">Sent Today</TableHead>
                                <TableHead className="text-xs w-[120px]">Health Score</TableHead>
                                <TableHead className="text-xs w-[80px]">Active</TableHead>
                                <TableHead className="text-xs w-[50px]"></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {senderAccounts.map(account => (
                                <TableRow key={account.id} className={cn(!account.active && 'opacity-60')}>
                                  <TableCell>
                                    <div>
                                      <p className="text-sm font-medium">{account.email}</p>
                                      <p className="text-xs text-muted-foreground">{account.displayName}</p>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className={cn("text-xs gap-1", account.provider === 'google' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-700 border-gray-200')}>
                                      {account.provider === 'google' ? <><FiMail size={10} />Google</> : <><FiServer size={10} />SMTP</>}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      className="h-7 w-20 text-xs text-center"
                                      value={account.dailyLimit}
                                      onChange={(e) => setSenderAccounts(prev => prev.map(s => s.id === account.id ? { ...s, dailyLimit: parseInt(e.target.value) || 0 } : s))}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium">{account.sentToday}</span>
                                      <span className="text-xs text-muted-foreground">/ {account.dailyLimit}</span>
                                    </div>
                                    <Progress value={(account.sentToday / Math.max(account.dailyLimit, 1)) * 100} className="h-1 mt-1" />
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <div className={cn("w-2 h-2 rounded-full flex-shrink-0", account.healthScore >= 90 ? 'bg-green-500' : account.healthScore >= 70 ? 'bg-amber-500' : 'bg-red-500')} />
                                      <span className={cn("text-sm font-medium", account.healthScore >= 90 ? 'text-green-700' : account.healthScore >= 70 ? 'text-amber-700' : 'text-red-700')}>
                                        {account.healthScore}%
                                      </span>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Switch
                                      checked={account.active}
                                      onCheckedChange={(checked) => setSenderAccounts(prev => prev.map(s => s.id === account.id ? { ...s, active: checked } : s))}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Button variant="ghost" size="sm" onClick={() => setSenderAccounts(prev => prev.filter(s => s.id !== account.id))} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
                                      <FiTrash2 size={13} />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>

                      {/* Warmup Tips */}
                      <Card className="bg-amber-50/50 backdrop-blur-[16px] border border-amber-100 shadow-sm">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <FiShield className="text-amber-600 mt-0.5 flex-shrink-0" size={16} />
                            <div>
                              <p className="text-xs font-semibold text-amber-800">Deliverability Tips</p>
                              <ul className="text-xs text-amber-700 mt-1 space-y-0.5 list-disc ml-4">
                                <li>Keep daily sends under 50 per account for fresh domains</li>
                                <li>Rotate sender accounts to avoid rate limits</li>
                                <li>Health scores below 70% may indicate deliverability issues</li>
                                <li>Warm up new accounts gradually over 2-4 weeks</li>
                              </ul>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {/* ---- TAB: Follow-up Rules ---- */}
                  {settingsTab === 'followup' && (
                    <div className="space-y-6">
                      {/* Follow-Up Cadence */}
                      <Card className="bg-white/75 backdrop-blur-[16px] border border-white/[0.18] shadow-md">
                        <CardHeader>
                          <CardTitle className="text-base font-semibold flex items-center gap-2"><FiClock size={16} />Follow-Up Cadence</CardTitle>
                          <CardDescription className="text-xs">Configure timing for automatic follow-up triggers</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                          <div className="space-y-2">
                            <Label className="text-xs font-medium">Days Before Follow-Up</Label>
                            <div className="flex items-center gap-3">
                              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setSettings(prev => ({ ...prev, followUpDays: Math.max(1, prev.followUpDays - 1) }))}>-</Button>
                              <span className="text-2xl font-bold w-10 text-center text-primary">{settings.followUpDays}</span>
                              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setSettings(prev => ({ ...prev, followUpDays: prev.followUpDays + 1 }))}>+</Button>
                              <span className="text-xs text-muted-foreground">days of no response</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">Leads in the pipeline will show a warning badge after {settings.followUpDays} days of inactivity.</p>
                          </div>

                          <Separator />

                          {/* Visual cadence timeline */}
                          <div>
                            <Label className="text-xs font-medium mb-3 block">Follow-Up Sequence Timeline</Label>
                            <div className="flex items-center gap-0">
                              {[
                                { label: 'Initial Send', day: 0, color: 'bg-primary' },
                                { label: 'Follow-up 1', day: settings.followUpDays, color: 'bg-blue-500' },
                                { label: 'Follow-up 2', day: settings.followUpDays * 2, color: 'bg-amber-500' },
                                { label: 'Follow-up 3', day: settings.followUpDays * 3, color: 'bg-red-500' },
                              ].map((step, i) => (
                                <React.Fragment key={i}>
                                  <div className="flex flex-col items-center">
                                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold", step.color)}>{i + 1}</div>
                                    <p className="text-[10px] font-medium mt-1 text-center max-w-[80px]">{step.label}</p>
                                    <p className="text-[10px] text-muted-foreground">Day {step.day}</p>
                                  </div>
                                  {i < 3 && <div className="flex-1 h-px bg-border mx-1 mb-8" />}
                                </React.Fragment>
                              ))}
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Follow-Up Rotation */}
                      <Card className="bg-white/75 backdrop-blur-[16px] border border-white/[0.18] shadow-md">
                        <CardHeader>
                          <CardTitle className="text-base font-semibold flex items-center gap-2"><FiRefreshCw size={16} />Follow-Up Rotation</CardTitle>
                          <CardDescription className="text-xs">Select which follow-up templates to rotate through</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {[
                            { id: 'rot-case', label: 'Case Study', desc: 'Share a relevant success story with concrete metrics', checked: settings.rotationCaseStudy, onChange: (c: boolean) => setSettings(prev => ({ ...prev, rotationCaseStudy: c })), icon: <FiStar size={14} className="text-blue-500" /> },
                            { id: 'rot-roi', label: 'ROI Calculator', desc: 'Offer a personalized ROI projection based on their scale', checked: settings.rotationRoiCalculator, onChange: (c: boolean) => setSettings(prev => ({ ...prev, rotationRoiCalculator: c })), icon: <FiDollarSign size={14} className="text-green-500" /> },
                            { id: 'rot-checkin', label: 'Check-in Nudge', desc: 'Brief, casual check-in with a new value proposition', checked: settings.rotationCheckin, onChange: (c: boolean) => setSettings(prev => ({ ...prev, rotationCheckin: c })), icon: <FiMessageSquare size={14} className="text-amber-500" /> },
                          ].map(item => (
                            <div key={item.id} className={cn("flex items-start gap-3 p-3 rounded-xl border transition-all", item.checked ? 'bg-primary/5 border-primary/20' : 'bg-secondary/20 border-border')}>
                              <Checkbox id={item.id} checked={item.checked} onCheckedChange={(c) => item.onChange(!!c)} className="mt-0.5" />
                              <div className="flex-1">
                                <Label htmlFor={item.id} className="text-sm font-medium cursor-pointer flex items-center gap-2">{item.icon}{item.label}</Label>
                                <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                              </div>
                              {item.checked && <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200 h-5">Active</Badge>}
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </div>
              )}

            </div>
          </main>
        </div>
      </TooltipProvider>
    </ErrorBoundary>
  )
}
