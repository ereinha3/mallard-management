import { useEffect, useMemo, useState } from 'react'
import { BookOpen, GraduationCap } from 'lucide-react'
import { lessonCount, modules } from './lessons'

const STORAGE_KEY = 'mallard-learn-progress'

function getStoredProgress() {
  if (typeof window === 'undefined') return []

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    const parsed = stored ? JSON.parse(stored) : []
    return Array.isArray(parsed) ? parsed.filter(Boolean) : []
  } catch {
    return []
  }
}

function saveStoredProgress(completedIds) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(completedIds))
}

function ProgressBar({ value, height = 6 }) {
  const safeValue = Math.max(0, Math.min(100, value))

  return (
    <div
      className="overflow-hidden"
      style={{
        height,
        borderRadius: 999,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
      }}
    >
      <div
        style={{
          width: `${safeValue}%`,
          height: '100%',
          borderRadius: 999,
          background: 'linear-gradient(90deg, var(--green, var(--emerald)), var(--green-bright))',
          transition: 'width 0.25s ease',
        }}
      />
    </div>
  )
}

function moduleProgress(module, completedSet) {
  const completed = module.lessons.filter(lesson => completedSet.has(lesson.id)).length
  return {
    completed,
    total: module.lessons.length,
    percent: Math.round((completed / module.lessons.length) * 100),
  }
}

function LessonRail({ activeLessonId, completedSet, onSelectLesson }) {
  return (
    <aside
      className="w-full lg:w-[340px] shrink-0 overflow-y-auto p-4 lg:p-6"
      style={{
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
      }}
    >
      <div className="mb-5 flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full"
          style={{
            background: 'linear-gradient(135deg, var(--gold), var(--gold-bright))',
            color: '#070910',
          }}
        >
          <GraduationCap size={19} />
        </div>
        <div>
          <h2 className="font-display text-xl font-semibold leading-none" style={{ color: 'var(--text-primary)' }}>
            Learn
          </h2>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Guided by Ask Mallard
          </p>
        </div>
      </div>

      <div className="mb-6 card-premium p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            Overall progress
          </span>
          <span className="font-mono text-xs" style={{ color: 'var(--green, var(--emerald))' }}>
            {Math.round((completedSet.size / lessonCount) * 100)}%
          </span>
        </div>
        <ProgressBar value={(completedSet.size / lessonCount) * 100} />
        <div className="mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
          {completedSet.size} of {lessonCount} lessons complete
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {modules.map(module => {
          const progress = moduleProgress(module, completedSet)

          return (
            <section key={module.id} className="card-premium p-4">
              <div className="mb-3">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {module.title}
                  </h3>
                  <span className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {progress.completed}/{progress.total}
                  </span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {module.description}
                </p>
                <div className="mt-3">
                  <ProgressBar value={progress.percent} height={5} />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {module.lessons.map(lesson => {
                  const active = lesson.id === activeLessonId
                  const complete = completedSet.has(lesson.id)

                  return (
                    <button
                      key={lesson.id}
                      type="button"
                      onClick={() => onSelectLesson(lesson.id)}
                      className="group flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-all duration-150"
                      style={{
                        background: active ? 'rgba(30, 185, 128, 0.12)' : 'transparent',
                        border: active ? '1px solid rgba(30, 185, 128, 0.32)' : '1px solid transparent',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <span
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                        style={{
                          background: complete
                            ? 'var(--green, var(--emerald))'
                            : active
                              ? 'rgba(30, 185, 128, 0.18)'
                              : 'var(--bg-elevated)',
                          border: complete ? '1px solid var(--green, var(--emerald))' : '1px solid var(--border-bright)',
                          color: complete ? '#070910' : 'var(--text-muted)',
                        }}
                      >
                        {complete ? '✓' : ''}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium leading-snug">{lesson.title}</span>
                        <span className="mt-1 block font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {lesson.readTime}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </aside>
  )
}

function getLessonById(lessonId) {
  for (const module of modules) {
    const lesson = module.lessons.find(item => item.id === lessonId)
    if (lesson) return { module, lesson }
  }
  return { module: modules[0], lesson: modules[0].lessons[0] }
}

function buildAskPrompt(lesson, horizonYears) {
  const horizonLine = horizonYears
    ? ` My investing horizon is ${horizonYears} years.`
    : ''
  return `Help me apply the lesson "${lesson.title}" to my financial plan.${horizonLine}`
}

export default function LearnView({ onboardResult }) {
  const onAskMallard = arguments[0]?.onAskMallard
  const [activeLessonId, setActiveLessonId] = useState(modules[0].lessons[0].id)
  const [completedIds, setCompletedIds] = useState([])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCompletedIds(getStoredProgress())
  }, [])

  const completedSet = useMemo(() => new Set(completedIds), [completedIds])
  const { module, lesson } = getLessonById(activeLessonId)
  const horizonYears = onboardResult?.validated_profile?.horizon_years
  const overallPercent = Math.round((completedSet.size / lessonCount) * 100)
  const isComplete = completedSet.has(lesson.id)

  function markComplete() {
    if (completedSet.has(lesson.id)) return
    const next = [...completedSet, lesson.id]
    setCompletedIds(next)
    saveStoredProgress(next)
  }

  function askMallard() {
    if (typeof onAskMallard === 'function') {
      onAskMallard({
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        prompt: buildAskPrompt(lesson, horizonYears),
      })
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <header
        className="shrink-0 px-6 py-5 lg:px-8"
        style={{
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <BookOpen size={15} style={{ color: 'var(--green, var(--emerald))' }} />
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Investing literacy
              </p>
            </div>
            <h1 className="font-display text-2xl font-semibold lg:text-3xl" style={{ color: 'var(--text-primary)' }}>
              Learn with Ask Mallard
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              A concise investing curriculum for building durable habits, understanding portfolio risk, and keeping more of what you earn.
            </p>
          </div>

          <div className="card-premium w-full p-4 lg:w-[280px]">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Course progress
              </span>
              <span className="font-mono text-sm" style={{ color: 'var(--green, var(--emerald))' }}>
                {overallPercent}%
              </span>
            </div>
            <ProgressBar value={overallPercent} />
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <LessonRail
          activeLessonId={activeLessonId}
          completedSet={completedSet}
          onSelectLesson={setActiveLessonId}
        />

        <main className="min-h-0 flex-1 overflow-y-auto p-5 lg:p-8">
          <article className="mx-auto flex max-w-4xl flex-col gap-5">
            <section className="card-premium p-6 lg:p-8">
              <div className="mb-6 flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-start lg:justify-between" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--green, var(--emerald))' }}>
                    {module.title}
                  </p>
                  <h2 className="font-display text-3xl font-semibold leading-tight lg:text-4xl" style={{ color: 'var(--text-primary)' }}>
                    {lesson.title}
                  </h2>
                </div>
                <div
                  className="flex w-fit shrink-0 items-center gap-2 rounded-full px-3 py-2 font-mono text-xs"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-bright)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <BookOpen size={13} />
                  {lesson.readTime}
                </div>
              </div>

              {horizonYears ? (
                <div
                  className="mb-6 rounded-lg px-4 py-3 text-sm leading-relaxed"
                  style={{
                    background: 'rgba(30, 185, 128, 0.10)',
                    border: '1px solid rgba(30, 185, 128, 0.24)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  With your <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{horizonYears}-year</span> horizon, Ask Mallard will frame lessons around long-term tradeoffs, compounding, and the amount of volatility your plan may need to withstand.
                </div>
              ) : null}

              <div className="flex flex-col gap-4">
                {lesson.sections.map(section => (
                  <p key={section} className="text-[15px] leading-7" style={{ color: 'var(--text-secondary)' }}>
                    {section}
                  </p>
                ))}
              </div>

              <div
                className="mt-8 rounded-lg p-5"
                style={{
                  background: 'linear-gradient(135deg, rgba(30, 185, 128, 0.12), rgba(30, 185, 128, 0.05))',
                  border: '1px solid rgba(30, 185, 128, 0.28)',
                }}
              >
                <div className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--green, var(--emerald))' }}>
                  Key takeaway
                </div>
                <p className="text-base leading-7" style={{ color: 'var(--text-primary)' }}>
                  {lesson.takeaway}
                </p>
              </div>
            </section>

            <section className="card-premium flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Ready to apply this lesson?
                </div>
                <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                  Ask Mallard can connect the concept to your profile, timeline, and portfolio decisions.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={markComplete}
                  disabled={isComplete}
                  className="rounded-lg px-4 py-3 text-sm font-semibold transition-all duration-150 disabled:cursor-default"
                  style={{
                    background: isComplete ? 'var(--bg-elevated)' : 'rgba(30, 185, 128, 0.12)',
                    border: isComplete ? '1px solid var(--border-bright)' : '1px solid rgba(30, 185, 128, 0.34)',
                    color: isComplete ? 'var(--text-muted)' : 'var(--green, var(--emerald))',
                  }}
                >
                  {isComplete ? 'Completed' : 'Mark as Complete'}
                </button>
                <button
                  type="button"
                  onClick={askMallard}
                  className="flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition-all duration-150 hover:brightness-110"
                  style={{
                    background: 'linear-gradient(135deg, var(--green, var(--emerald)), var(--green-bright))',
                    border: '1px solid var(--green-light)',
                    color: '#070910',
                  }}
                >
                  <GraduationCap size={16} />
                  Ask Mallard about this
                </button>
              </div>
            </section>
          </article>
        </main>
      </div>
    </div>
  )
}
