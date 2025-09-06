import type { RFState } from '../state/useGraphStore';

const LOCAL_STORAGE_KEY = 'node-graph-ecs-graph';

export function saveGraphToLocalStorage(graph: Pick<RFState, 'nodes' | 'edges'>) {
  try {
    const data = JSON.stringify(graph);
    localStorage.setItem(LOCAL_STORAGE_KEY, data);
    console.log('Graph saved to localStorage');
  } catch (error) {
    console.error('Failed to save graph to localStorage', error);
  }
}

export function loadGraphFromLocalStorage(): Pick<RFState, 'nodes' | 'edges'> | null {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (data === null) {
      return null;
    }
    console.log('Graph loaded from localStorage');
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to load graph from localStorage', error);
    return null;
  }
}
