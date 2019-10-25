// Type definitions for Minimap.js
// Project: [LIBRARY_URL_HERE] 
// Definitions by: [YOUR_NAME_HERE] <[YOUR_URL_HERE]> 
// Definitions: https://github.com/borisyankov/DefinitelyTyped

import {
	OrthographicCamera
} from '../../../src/Three';
/**
 * 
 */
declare interface Minimap {
		
	/**
	 * 
	 * @param renderer 
	 * @param scene 
	 * @param mainCamera 
	 * @param params 
	 */
	new (renderer : any, scene : any, mainCamera : any, params : any);
		
	/**
	 * @param flag 
	 */
	setMinimapVisibility(flag : boolean): void;
		
	/**
	 * 
	 */
	renderMinimap(): void;

	/**
	 * 
	 */
	getCamera(): OrthographicCamera;
}
