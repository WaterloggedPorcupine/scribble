import { app, Menu, type MenuItemConstructorOptions } from 'electron'

/**
 * A short, ordinary app menu. Mostly it's here so the usual shortcuts (copy, paste, undo, quit)
 * work everywhere. Developer tools only appear while developing.
 */
export function buildMenu() {
  const mac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(mac ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),
    { label: 'File', submenu: [mac ? { role: 'close' } : { role: 'quit' }] },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : ([{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }] as MenuItemConstructorOptions[])),
      ],
    },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
