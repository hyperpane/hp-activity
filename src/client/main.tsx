// The client part: the Activity window. The readings are taken by the
// server part, on the server.

import { mount } from '@hyperpane/sdk/client';
import { NodeMessage } from '@hyperpane/ui';
import { ActivityView } from './ActivityView.tsx';

mount((host) => (host.view.type === 'node' && host.view.kind === 'activity' ? <ActivityView /> : <NodeMessage error>Activity has no “{host.view.type}” view here.</NodeMessage>));
