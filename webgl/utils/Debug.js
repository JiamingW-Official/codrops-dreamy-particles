import GUI from 'lil-gui'
import Stats from './Stats';


export default class Debug {

  static instance;

  constructor() {
    // this.active = window.location.hash === '#debug';
    this.active = true;

    if (this.active) {
      this.gui = new GUI();
      // Collapse the panel by default to keep UI unobtrusive on load.
      this.gui.close();
      this.stats = new Stats(false);
    }
  }

  static getInstance() {
    if (!Debug.instance) {
      Debug.instance = new Debug();
    }

    return Debug.instance;
  }


  dispose() {
    this.stats.dispose();
  }
}
