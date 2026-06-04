// The Owner Command Center (W1-A) — the 3-column desktop layout that turns the
// owner's brief into one screen they clear and close. Col-1 "Needs You" is first
// and widest (the decisions); Col-2 "Portfolio" is the at-a-glance health; Col-3
// "This Week" is the trend zone. Below xl it stacks in the same priority order,
// so the phone/tablet view still leads with what needs the owner.
import { NeedsYou } from './NeedsYou'
import { Portfolio } from './Portfolio'
import { ThisWeek } from './ThisWeek'
import type { OwnerHome } from '../../api/dashboard'

export function CommandCenter({
  home,
  date,
  selectedSiteId,
  onSelectSite,
}: {
  home: OwnerHome
  date: string
  selectedSiteId: string | null
  onSelectSite: (id: string | null) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
      <NeedsYou home={home} date={date} selectedSiteId={selectedSiteId} />
      <Portfolio
        home={home}
        selectedSiteId={selectedSiteId}
        onSelectSite={onSelectSite}
      />
      <ThisWeek />
    </div>
  )
}
