//Interaction that finds the active border box and rotates it with the features in the features paramater
class RotateInteraction extends ol.interaction.Translate {
  /**
   * Handle pointer down events.
   * @param {import("../MapBrowserEvent.js").default} event Event.
   * @return {boolean} If the event was consumed.
   */
  handleDownEvent(event) {

    if (!event.originalEvent || !boundingBox.rotationMode) {//!ol.events.condition.shiftKeyOnly(event)) {
      return false;
    }
    this.lastFeature_ = this.featuresAtPixel_(event.pixel, event.map);
    if (!this.lastCoordinate_ && this.lastFeature_) {
      this.startCoordinate_ = event.coordinate;
      this.lastCoordinate_ = event.coordinate;
      this.handleMoveEvent(event);
      this.dispatchEvent('rotatestart');
      return true;
    }
    return false;
  }

  /**
   * Handle pointer up events.
   * @param {import("../MapBrowserEvent.js").default} event Event.
   * @return {boolean} If the event was consumed.
   */
  handleUpEvent(event) {
    if (this.lastCoordinate_) {
      this.lastCoordinate_ = null;
      this.handleMoveEvent(event);
      this.dispatchEvent('rotateend');
      // cleanup
      this.startCoordinate_ = null;
      return true;
    }
    return false;
  }

  handleDragEvent(evt) {

    if (this.lastCoordinate_) {
      const newCoordinate = evt.coordinate;
      const features = this.features_ || new Collection([this.lastFeature_]);

      var geom;
      var coords;
      var geomBox;

      dataLayers.forEach(function(layer) {
        if (layer.id == boundingBox.activeLayerID){
          coords = layer.borderBox.flatCoordinates;
          geom = layer.borderBoxFeatures[0].getGeometry();
          geomBox = layer.borderBoxFeatures[0];
        }
      });

      //rotate shape
      //c^2 = a^2 + b^2 − 2ab cos(C)
      //c^2 - a^2 - b^2 = -2ab cos(C)
      //-c^2 + a^2 + b^2 = 2ab cos(C)
      //-c^2 + a^2 + b^2) / 2ab = cos(C)
      //arccos(-c^2 + a^2 + b^2) / 2ab) = C
      var center = [(coords[0] + coords[4]) / 2, (coords[1] + coords[5]) / 2];
      var m = [center[0], center[1], 1, this.lastCoordinate_[0], this.lastCoordinate_[1], 1, newCoordinate[0], newCoordinate[1], 1];
      var det = m[0]*(m[4]*m[8] - m[5]*m[7]) - m[1]*(m[3]*m[8] - m[6]*m[5]) + m[2]*(m[3]*m[7] - m[4]*m[6]);

      var c = getDistance(newCoordinate, this.lastCoordinate_);
      var b = getDistance(newCoordinate, center);
      var a = getDistance(this.lastCoordinate_, center);
      //determine direction of rotation
      var direction;
      if (det > 0) { direction = 1; }
      else { direction = -1; }
      //rotate by arc length
      geom.rotate(direction * Math.acos((-(Math.pow(c,2)) + Math.pow(a,2) + Math.pow(b,2)) / (2 * a * b)), center);
      geomBox.setGeometry(geom);
      
      updateBoundingBox();
      this.lastCoordinate_ = newCoordinate;
      this.dispatchEvent('rotating');
    }
  }

}
//used for edge translate events such that they are locked to one axis
class CustomTranslateInteraction extends ol.interaction.Translate {
  /**
   * Handle pointer down events.
   * @param {import("../MapBrowserEvent.js").default} event Event.
   * @return {boolean} If the event was consumed.
   */
  handleDownEvent(event) {
    if (!event.originalEvent) {
      return false;
    }
    this.lastFeature_ = this.featuresAtPixel_(event.pixel, event.map);
    if (!this.lastCoordinate_ && this.lastFeature_) {
      this.startCoordinate_ = event.coordinate;
      this.lastCoordinate_ = event.coordinate;
      this.handleMoveEvent(event);
      this.dispatchEvent('movestart');
      return true;
    }
    return false;
  }

  /**
   * Handle pointer up events.
   * @param {import("../MapBrowserEvent.js").default} event Event.
   * @return {boolean} If the event was consumed.
   */
  handleUpEvent(event) {
    if (this.lastCoordinate_) {
      this.lastCoordinate_ = null;
      this.handleMoveEvent(event);
      this.dispatchEvent('moveend');
      // cleanup
      this.startCoordinate_ = null;
      return true;
    }
    return false;
  }

  handleDragEvent(evt) {

    if (this.lastCoordinate_) {
      const newCoordinate = evt.coordinate;
      const features = this.features_

      this.dispatchEvent({
        type: 'moving',
        features: features,
        oldCoord: this.lastCoordinate_,
        newCoord: newCoordinate
      });

      this.lastCoordinate_ = newCoordinate;
    }
  }

}
function getDistance(p1, p2){
  return Math.sqrt(Math.abs(Math.pow(p1[0]-p2[0], 2)) + Math.abs(Math.pow(p1[1]-p2[1], 2)));
}
