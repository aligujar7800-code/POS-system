import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { check } from '@tauri-apps/plugin-updater';
import { ask, message } from '@tauri-apps/plugin-dialog';
import { relaunch } from '@tauri-apps/plugin-process';

export default function AppShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    async function checkForUpdates() {
      try {
        const update = await check();
        if (update) {
          const yes = await ask(
            `Update ${update.version} is available!\n\nRelease notes: ${update.body}\n\nDo you want to install it now and restart?`,
            { title: 'Update Available', kind: 'info' }
          );
          if (yes) {
            let downloaded = 0;
            let contentLength = 0;
            
            await update.downloadAndInstall((event) => {
              switch (event.event) {
                case 'Started':
                  contentLength = event.data.contentLength || 0;
                  break;
                case 'Progress':
                  downloaded += event.data.chunkLength;
                  console.log(`Downloaded ${downloaded} from ${contentLength}`);
                  break;
                case 'Finished':
                  console.log('Download finished');
                  break;
              }
            });
            await relaunch();
          }
        }
      } catch (err) {
        console.error("AutoUpdate Failed:", err);
      }
    }
    checkForUpdates();
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
