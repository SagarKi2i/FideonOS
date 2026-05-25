const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  isElectron: () => ipcRenderer.invoke('is-electron'),
  
  ollama: {
    checkStatus: () => ipcRenderer.invoke('ollama:check-status'),
    listModels: () => ipcRenderer.invoke('ollama:list-models'),
    pullModel: (modelName) => ipcRenderer.invoke('ollama:pull-model', modelName),
    generate: (params) => ipcRenderer.invoke('ollama:generate', params),
    deleteModel: (modelName) => ipcRenderer.invoke('ollama:delete-model', modelName),
    
    onPullProgress: (callback) => {
      ipcRenderer.on('ollama:pull-progress', (event, data) => callback(data));
    },
    
    onGenerateChunk: (callback) => {
      ipcRenderer.on('ollama:generate-chunk', (event, data) => callback(data));
    },
    
    removePullProgressListener: () => {
      ipcRenderer.removeAllListeners('ollama:pull-progress');
    },
    
    removeGenerateChunkListener: () => {
      ipcRenderer.removeAllListeners('ollama:generate-chunk');
    },
  },
  
  training: {
    createModelfile: (params) => ipcRenderer.invoke('training:create-modelfile', params),
    startFineTune: (params) => ipcRenderer.invoke('training:start-fine-tune', params),
    getTrainingStatus: (jobId) => ipcRenderer.invoke('training:get-status', jobId),
    cancelTraining: (jobId) => ipcRenderer.invoke('training:cancel', jobId),
    exportGradients: (params) => ipcRenderer.invoke('training:export-gradients', params),
    applyModelUpdate: (params) => ipcRenderer.invoke('training:apply-update', params),
    
    onTrainingProgress: (callback) => {
      ipcRenderer.on('training:progress', (event, data) => callback(data));
    },
    
    removeTrainingProgressListener: () => {
      ipcRenderer.removeAllListeners('training:progress');
    },
  },
  
  network: {
    checkStatus: () => ipcRenderer.invoke('network:check-status'),
  },

  // FNF-425 / 426 / 427 / 428 — system service management
  service: {
    install:   () => ipcRenderer.invoke('service:install'),
    uninstall: () => ipcRenderer.invoke('service:uninstall'),
    status:    () => ipcRenderer.invoke('service:status'),
  },
});
