// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 fireball1725

import { Outlet } from 'react-router-dom'

export default function SettingsLayout() {
  return (
    <div className="h-full overflow-auto bg-gray-50 dark:bg-gray-950">
      <Outlet />
    </div>
  )
}
