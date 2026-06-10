import { useEffect, useReducer } from 'react'
import type { TimelineState } from '../effects'
import type { HistorySpan } from '../types'

interface TimelineBarProps {
  span: HistorySpan
  timeline: TimelineState
  timelineOn: boolean
  onTimelineOn: (on: boolean) => void
}

const SPEEDS = [1, 2, 4]

function formatEra(unix: number, span: HistorySpan): string {
  const d = new Date(unix * 1000)
  // young repos scrub in days; old ones in months
  if (span.end - span.start < 120 * 86400) {
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  }
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

/**
 * The time machine: play the repository's whole life as star formation, or
 * scrub to any moment. Mutates the shared TimelineState that the render
 * loop reads; its own readout refreshes on a coarse interval while playing.
 */
export function TimelineBar({ span, timeline, timelineOn, onTimelineOn }: TimelineBarProps) {
  const [, refresh] = useReducer((n: number) => n + 1, 0)

  // While playing, the era advances in the render loop — poll it for display.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (timeline.playing || timeline.era !== null) refresh()
    }, 120)
    return () => window.clearInterval(id)
  }, [timeline])

  const era = timeline.era
  const frac = era === null ? 1 : (era - span.start) / Math.max(1, span.end - span.start)
  const atEnd = era !== null && era >= span.end

  const play = () => {
    if (timeline.era === null || atEnd) timeline.era = span.start
    timeline.playing = true
    onTimelineOn(true)
    refresh()
  }
  const pause = () => {
    timeline.playing = false
    refresh()
  }
  const exit = () => {
    timeline.era = null
    timeline.playing = false
    onTimelineOn(false)
    refresh()
  }
  const scrub = (value: number) => {
    timeline.era = span.start + (value / 1000) * (span.end - span.start)
    onTimelineOn(true)
    refresh()
  }
  const cycleSpeed = () => {
    timeline.speed = SPEEDS[(SPEEDS.indexOf(timeline.speed) + 1) % SPEEDS.length]
    refresh()
  }

  return (
    <div className="panel timeline">
      <button
        className="timeline-play"
        title={timeline.playing ? 'pause' : 'watch the repo being born'}
        onClick={timeline.playing ? pause : play}
      >
        {timeline.playing ? '❚❚' : '▶'}
      </button>
      <input
        type="range"
        min={0}
        max={1000}
        value={Math.round(frac * 1000)}
        onChange={(e) => scrub(Number(e.target.value))}
        aria-label="scrub through history"
      />
      <span className="timeline-era">
        {era === null ? 'today' : formatEra(era, span)}
      </span>
      <button className="timeline-chip" onClick={cycleSpeed} title="playback speed">
        {timeline.speed}×
      </button>
      {timelineOn && (
        <button className="timeline-chip" onClick={exit} title="return to the present">
          now
        </button>
      )}
      <span className="timeline-commits">{span.commits.toLocaleString()} commits</span>
    </div>
  )
}
