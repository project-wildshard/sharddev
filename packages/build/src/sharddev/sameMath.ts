// QA 11-23-b row 14: imported first, so every module after it, and the author code a build runs, sees the same Math on
// x86-64 and arm64 (@wildshard/sdk/deterministicMath says why).
import { installDeterministicMath } from '@wildshard/sdk/deterministicMath';

installDeterministicMath();
