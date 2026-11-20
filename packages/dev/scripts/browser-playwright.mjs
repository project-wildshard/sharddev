import * as playwright from 'playwright';
import {installMachineBrowserAdmission} from './browser-machine-loader.mjs';
import { installBrowserActorMarker } from './wildshard-browser-marker.mjs';

await installMachineBrowserAdmission(playwright);
installBrowserActorMarker(playwright);
export const {chromium,firefox,webkit,devices,request,selectors,errors}=playwright;
