function createBoundingBox() {
  //initialize boundingBox properties
  boundingBox.color = "rgba(0, 255, 255, 1)";
  boundingBox.mapLayer = createMapLayer(boundingBox);
  boundingBox.mapLayer.setZIndex(1);
  boundingBox.rotationMode = false;

  var mapLayer = boundingBox.mapLayer;
  var source = mapLayer.getSource();

  map.addLayer(mapLayer);

  boundingBox.activeLayerID = getActiveDatasetId();
  var parameters;
  dataLayers.forEach(function(layer) {
    if (layer.id == boundingBox.activeLayerID){
      parameters = layer.parameters;
    }
  });

  //set of initial coordinates
  var coordinates = [
      [0.0, 0.0],
      [1.0, 0.0],
      [1.0, 1.0],
      [0.0, 1.0],
      [0.0, 0.0]
  ];

  //creates dashed bounding box feature
  boundingBox.geometry = new ol.geom.LineString(coordinates);
  boundingBox.boundingFeat = new ol.Feature({geometry: boundingBox.geometry});
  boundingFeat = boundingBox.boundingFeat;
  var boundingStroke = new ol.style.Stroke({color: "rgba(0, 255, 255, 1)", width: 1, lineDash: [20, 20]});
  boundingFeat.setStyle([
    new ol.style.Style({
      stroke : boundingStroke
    })
  ]);
  source.addFeature(boundingFeat);

  //adds translation interaction and listeners to bounding box
  var tempBoxVal = [];
  var tempCenter = [];
  var moved = false;
  var boxTranslateEvent = new ol.interaction.Translate({
      features: new ol.Collection([boundingFeat]),
      layers: [mapLayer],
      hitTolerance: 7,
  });

  //store initial coordinates
  boxTranslateEvent.on("translatestart", function() {
      tempBoxVal = [...boundingBox.geometry.flatCoordinates];
      moved = false;
  })

  //move corners with box
  //move both boxes together
  boxTranslateEvent.on("translating", function() {
      moved = true;
      var bboxGeom = boundingBox.geometry.flatCoordinates;
      var layerBox;
      dataLayers.forEach((item) => {
        if (item.id == boundingBox.activeLayerID)
          layerBox = item.borderBoxFeatures[0];
      });

      layerBox.getGeometry().translate(bboxGeom[0] - tempBoxVal[0], bboxGeom[1] - tempBoxVal[1]);
      tempBoxVal = [...boundingBox.geometry.flatCoordinates];

      updateBoundingPoints();
  })

  //update affine matrix when translation is finished
  boxTranslateEvent.on("translateend", function() {
      if (!moved){ //check for single click without movement
        setRotationMode(!boundingBox.rotationMode);
        return;
      }

      var parameters;
      var layerBox;
      dataLayers.forEach((item) => {
        if (item.id == boundingBox.activeLayerID){
          layerBox = item.borderBoxFeatures[0].getGeometry().flatCoordinates;
          parameters = item.parameters;
        }
      });
      parameters.affinematrix = findAffineTransformedVals(layerBox);

      //updates form
      for (var i = 1; i <= 6; i++){
          jQuery("input[name=a"+ i +"]").val(parameters.affinematrix[i-1]);
      }
      //updates layer
      saveLayerChanges();
  })

  //add translate event to the map
  map.addInteraction(
      boxTranslateEvent
  );

  //define corner point features so they can be used in rotation interaction
  var col = new ol.Collection([]);
  boundingBox.cornerPointFeatures = [];
  var cornerPointFeatures = boundingBox.cornerPointFeatures;
  for (var i = 0; i < 4; i++){
      cornerPointFeatures[i] = new ol.Feature({
        geometry: new ol.geom.Point(coordinates[i]),
        pointIndex: i
      });
      col.push(cornerPointFeatures[i]);
  }

  var boxRotateEvent = new RotateInteraction({
      features: col, //interaction points
      //lineFeat: boundingFeat, //linestring feature to be moved
      layers: [mapLayer],
      hitTolerance: 7,
  });

  boxRotateEvent.addEventListener("rotatestart", function() {
    moved = false;
  });

  boxRotateEvent.addEventListener("rotating", function() {
    moved = true;
  });

  //update affine matrix when translation is finished
  boxRotateEvent.addEventListener("rotateend", function() {
      if (!moved){
        setRotationMode(false);
        return;
      }

      var parameters;
      var layerBox;
      dataLayers.forEach((item) => {
        if (item.id == boundingBox.activeLayerID){
          layerBox = item.borderBoxFeatures[0].getGeometry().flatCoordinates;
          parameters = item.parameters;
        }
      });
      parameters.affinematrix = findAffineTransformedVals(layerBox);

      //updates form
      for (var i = 1; i <= 6; i++){
          jQuery("input[name=a"+ i +"]").val(parameters.affinematrix[i-1]);
      }
      //updates layer
      saveLayerChanges();
  })

  //interaction added to map after corner point translation interactions

  //create corner points and edge points. add them to map
  boundingBox.edgePointFeatures = [];
  var edgePointFeatures = boundingBox.edgePointFeatures;
  var pointTranlateEvents = [];
  var edgeTranlateEvents = [];

  for (var i = 0; i < 4; i++){

      edgePointFeatures[i] = new ol.Feature({
        geometry: new ol.geom.Point([
          coordinates[i][0] + (coordinates[i+1][0] - coordinates[i][0])/2 ,
          coordinates[i][1] + (coordinates[i+1][1] - coordinates[i][1])/2
        ]),
        pointIndex: i
      });

      cornerPointFeatures[i].setStyle(
        new ol.style.Style({
          text: new ol.style.Text({
            text: '\uf424',
            font: 'normal 15px FontAwesome',
            fill: new ol.style.Fill({
              color: 'blue',
            }),
            rotation: (Math.PI/2 * i)
          })
        })
      );

      edgePointFeatures[i].setStyle(
        new ol.style.Style({
          text: new ol.style.Text({
            text: '\uf424',
            font: 'normal 15px FontAwesome',
            fill: new ol.style.Fill({
              color: 'blue',
            }),
            rotation: (-Math.PI/4 + (Math.PI/2 * i))
          })
        })
      );

      source.addFeature(cornerPointFeatures[i]);
      source.addFeature(edgePointFeatures[i]);

      edgeTranlateEvents[i] = new CustomTranslateInteraction({
          features: new ol.Collection([edgePointFeatures[i]]),
          layers: [mapLayer],
          hitTolerance: 5,
      })

      edgeTranlateEvents[i].addEventListener("movestart", function() {
        tempBoxVal = [...boundingBox.geometry.flatCoordinates];
      });


      edgeTranlateEvents[i].addEventListener("moving", function(evt) {
        var index = evt.features.getArray()[0].get("pointIndex");
        var bboxCoords = boundingBox.geometry.flatCoordinates;
        var layerBox;
        dataLayers.forEach((item) => {
          if (item.id == boundingBox.activeLayerID){
            layerBox = item.borderBoxFeatures[0].getGeometry();
          }
        });
        var deltax = evt.newCoord[0] - evt.oldCoord[0];
        var deltay = evt.newCoord[1] - evt.oldCoord[1];

        //scale
        if (!boundingBox.rotationMode){

          switch (index) {
            case 0:
              bboxCoords[1] = bboxCoords[1] + deltay;
              bboxCoords[3] = bboxCoords[3] + deltay;
              bboxCoords[9] = bboxCoords[9] + deltay;
              break;
            case 1:
              bboxCoords[2] = bboxCoords[2] + deltax;
              bboxCoords[4] = bboxCoords[4] + deltax;
              break;
            case 2:
              bboxCoords[5] = bboxCoords[5] + deltay;
              bboxCoords[7] = bboxCoords[7] + deltay;
              break;
            case 3:
              bboxCoords[6] = bboxCoords[6] + deltax;
              bboxCoords[8] = bboxCoords[8] + deltax;
              bboxCoords[0] = bboxCoords[0] + deltax;
              break;
          }

          scaleBorderToBounding(layerBox, tempBoxVal);
          tempBoxVal = [...boundingBox.geometry.flatCoordinates];

        }else{ //sheer
          var boxHeight = bboxCoords[5] - bboxCoords[1];
          var boxWidth = bboxCoords[2] - bboxCoords[0];
           //skew each point based on how far it is from the opposing side
           for(var i = 0; i < 10; i += 2){
             var point = [layerBox.flatCoordinates[i], layerBox.flatCoordinates[i + 1]];
             var skewRatio;


             switch (index) {
               case 0: //skew ratio = distance between top of box and point / total box height
                  skewRatio = (bboxCoords[5] - point[1]) / boxHeight;
                  point[0] = point[0] + (deltax * skewRatio);
                  break;
               case 1:
                 skewRatio = (point[0] - bboxCoords[0]) / boxWidth;
                 point[1] = point[1] + (deltay * skewRatio);
                 break;
               case 2:
                 skewRatio = (point[1] - bboxCoords[1]) / boxHeight;
                 point[0] = point[0] + (deltax * skewRatio);
                 break;
               case 3:
                 skewRatio = (bboxCoords[2] - point[0]) / boxWidth;
                 point[1] = point[1] + (deltay * skewRatio);
                 break;
             }


           layerBox.flatCoordinates[i] = point[0];
           layerBox.flatCoordinates[i+1] = point[1];
         }

         dataLayers.forEach((item) => {
           if (item.id == boundingBox.activeLayerID){
             layerBox = item.mapLayer.getSource().changed();
           }
         });
         updateBoundingBox();

        }
        //update corner and edge points
        updateBoundingPoints();

      });

      //update affine matrix when translation is finished
      edgeTranlateEvents[i].addEventListener("moveend", function() {
        var parameters;
        var layerBox;
        dataLayers.forEach((item) => {
          if (item.id == boundingBox.activeLayerID){
            layerBox = item.borderBoxFeatures[0].getGeometry().flatCoordinates;
            parameters = item.parameters;
          }
        });
        parameters.affinematrix = findAffineTransformedVals(layerBox);

        //updates form
        for (var i = 1; i <= 6; i++){
            jQuery("input[name=a"+ i +"]").val(parameters.affinematrix[i-1]);
        }
        //updates layer and box
        saveLayerChanges();
        updateBoundingBox();
      });

      //adds translation interaction and listeners to each corner
      pointTranlateEvents[i] = new ol.interaction.Translate({
          features: new ol.Collection([cornerPointFeatures[i]]),
          layers: [mapLayer],
          hitTolerance: 2,
      })

      //store initial coordinates
      pointTranlateEvents[i].on("translatestart", function() {
          tempBoxVal = [...boundingBox.geometry.flatCoordinates];
      })

      //anchor opposite corner and move bounding box with selected corner
      pointTranlateEvents[i].on("translating", function(evt) {
          var index = evt.features.getArray()[0].get("pointIndex");
          var bboxCoords = boundingBox.geometry.flatCoordinates;
          var minx = bboxCoords[0];
          var miny = bboxCoords[1];
          var maxx = bboxCoords[2];
          var maxy = bboxCoords[5];
          var center = cornerPointFeatures[index].getGeometry().getCoordinates();

          switch (index) {
            case 0:
              minx = center[0];
              miny = center[1];
              break;
            case 1:
              maxx = center[0];
              miny = center[1];
              break;
            case 2:
              maxx = center[0];
              maxy = center[1];
              break;
            case 3:
              minx = center[0];
              maxy = center[1];
              break;
          }

          //set bounding box coords
          boundingBox.geometry.setCoordinates([[minx, miny], [maxx, miny], [maxx, maxy], [minx, maxy], [minx, miny]]);

          //rescale active layer geometry as per updated bounding box

          dataLayers.forEach((item) => {
            if (item.id == boundingBox.activeLayerID){
              layerBox = item.borderBoxFeatures[0].getGeometry();
            }
          });
          scaleBorderToBounding(layerBox, tempBoxVal);
          tempBoxVal = [...boundingBox.geometry.flatCoordinates];

          //update corner and edge points
          updateBoundingPoints();

      })

      //apply derived scale matrix to existing affine matrix
      pointTranlateEvents[i].on("translateend", function(evt) {
          var parameters;
          var layerBox;
          dataLayers.forEach((item) => {
            if (item.id == boundingBox.activeLayerID){
              layerBox = item.borderBoxFeatures[0].getGeometry().flatCoordinates;
              parameters = item.parameters;
            }
          });
          parameters.affinematrix = findAffineTransformedVals(layerBox);

          //updates form
          for (var i = 1; i <= 6; i++){
              jQuery("input[name=a"+ i +"]").val(parameters.affinematrix[i-1]);
          }
          //updates layer and box
          saveLayerChanges();
          updateBoundingBox();
      })
      //add translate events to the map
      map.addInteraction(
          pointTranlateEvents[i]
      );

    }

    //add translate event to the map
    map.addInteraction(
        boxRotateEvent
    );

    for (var i = 0; i < 4; i++){
      //add edge interaction events to the map
      map.addInteraction(
          edgeTranlateEvents[i]
      );
    }

    //Highlights corner points and bounding box on hover
    map.on('pointermove', function(evt){
      var pixel = evt.pixel;

      cornerPointFeatures.forEach(function(feature){
        feature.getStyle().getText().setStroke();
        feature.changed();
      });
      edgePointFeatures.forEach(function(feature){
        feature.getStyle().getText().setStroke();
        feature.changed();
      });

      if (boundingBox.boundingFeat.getStyle().length > 1)
        boundingBox.boundingFeat.getStyle().shift();

      var flag = false;
      map.forEachFeatureAtPixel(pixel, function(feature){
        if (feature.get("pointIndex") || feature.get("pointIndex") === 0){
          var tempStyle = feature.getStyle();
          feature.getStyle().getText().setStroke(
            new ol.style.Stroke({ color: 'grey', width: 2 })
          );
          feature.changed();
          flag = true;
        } else if (!flag && feature == boundingBox.boundingFeat && !boundingBox.boundingFeat.getStyle()[1]){
          boundingBox.boundingFeat.getStyle().unshift(
            new ol.style.Style({
              stroke: new ol.style.Stroke({ color: 'grey', width: 4, lineDash: [20, 20] })
            })
          );
        }
      },
      { hitTolerance: 5 });

    });

}

//updates bounding box when active dataset changes or coordinates are made negative
function updateBoundingBox(){
  boundingBox.activeLayerID = getActiveDatasetId();

  var coordinates;
  dataLayers.forEach(function(layer) {
    if (layer.id == boundingBox.activeLayerID){
      coordinates = layer.borderBox.flatCoordinates;

      //sets color
      boundingBox.edgePointFeatures.forEach(function(feat) {
        feat.getStyle().getText().getFill().setColor(layer.color);
      });
      boundingBox.cornerPointFeatures.forEach(function(feat) {
        feat.getStyle().getText().getFill().setColor(layer.color);
      });
    }
  });

  //Finds max's and min's of selected dataset and bounds those values in a rectanle
  var minx = coordinates[0];
  var maxx = coordinates[0];
  var miny = coordinates[1];
  var maxy = coordinates[1];

  coordinates.forEach(function(val, i){
    if (i % 2 == 0){
      if (minx > val)
        minx = val;
      if (maxx < val)
        maxx = val;
    }
    else{
      if (miny > val)
        miny = val;
      if (maxy < val)
        maxy = val;
    }
  });

  boundingBox.geometry.setCoordinates([
    [minx, miny],
    [maxx, miny],
    [maxx, maxy],
    [minx, maxy],
    [minx, miny]
  ]);
  //updates corner and edge points to bounding box
  updateBoundingPoints();

}

function setRotationMode(a){
  if (a != boundingBox.rotationMode){
    boundingBox.edgePointFeatures.forEach(function(feat, i){
      feat.getStyle().getText().setRotation(feat.getStyle().getText().getRotation() + Math.PI/2);
    })
    boundingBox.cornerPointFeatures.forEach(function(feat, i){
      feat.getStyle().getText().setRotation(feat.getStyle().getText().getRotation() + Math.PI/2);
    })
  }
  boundingBox.rotationMode = a;
  boundingBox.mapLayer.getSource().changed();
}
//scales border box to meet edges of adjusted bounding box
function scaleBorderToBounding(layerBox, tempBoxVal){
  var bboxCoords = boundingBox.geometry.flatCoordinates;

  var minx = bboxCoords[0];
  var maxx = bboxCoords[0];
  var miny = bboxCoords[1];
  var maxy = bboxCoords[1];

  bboxCoords.forEach(function(val, i){
    if (i % 2 == 0){
      if (minx > val)
        minx = val;
      if (maxx < val)
        maxx = val;
    }
    else{
      if (miny > val)
        miny = val;
      if (maxy < val)
        maxy = val;
    }
  });

  layerBox.scale(
    Math.abs(minx - maxx) / Math.abs(tempBoxVal[0] - tempBoxVal[2]), Math.abs(miny- maxy) / Math.abs(tempBoxVal[1] - tempBoxVal[5])
  );
  var tempx = layerBox.flatCoordinates[0], tempy = layerBox.flatCoordinates[1];
  layerBox.flatCoordinates.forEach((item, i) => {
    if (i % 2 == 0 && item < tempx){ tempx = item; }
    else if (i % 2 == 1 && item < tempy){ tempy = item; }
  });
  var boundx = boundingBox.geometry.flatCoordinates[0], boundy = boundingBox.geometry.flatCoordinates[1];
  boundingBox.geometry.flatCoordinates.forEach((item, i) => {
    if (i % 2 == 0 && item < boundx){ boundx = item; }
    else if (i % 2 == 1 && item < boundy){ boundy = item; }
  });
  layerBox.translate(boundx - tempx, boundy - tempy);
}

//updates corner and edge points to bounding box
function updateBoundingPoints(){
  var bboxCoords = boundingBox.geometry.flatCoordinates;
  boundingBox.cornerPointFeatures.forEach(function(feat, i){
    feat.getGeometry().setCoordinates([ bboxCoords[2*i], bboxCoords[2*i + 1] ]);
  });

  boundingBox.edgePointFeatures.forEach(function(feat, i){
    feat.getGeometry().setCoordinates([
      bboxCoords[2*i] + (bboxCoords[2*(i+1)] - bboxCoords[2*i])/2,
      bboxCoords[2*i + 1] + (bboxCoords[2*(i+1) + 1] - bboxCoords[2*i + 1])/2
    ]);
  });
}
