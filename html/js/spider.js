// The path (relative to the current path) of the generator
var generatorPath;
// A cyclic list of colors to use for all layers
var colorNames = ["blue", "red", "green", "orange", "black", "purple", "gray", "brown"];
// A list of layers that are currently added by the user
var dataLayers = [];
// The map of OpenLayers that contains all the visualizations
var map;
// The control that zooms to all dataset on the visualization component
var zoomAllControl;
// A flag to ensure that we change the map view to contain the first generated dataset
var firstDataset = true;

// A map of which input fields to enable for each distribution
var fEnableObj = {
    "percentage": "diagonal",
    "buffer": "diagonal",
    "probability": "bit",
    "digits": "bit",
    "srange": "parcel",
    "dither": "parcel"
}

// Short names for the distributions to make the permalink shorter
const shortNames = {
    "uniform": "U",
    "diagonal": "D",
    "gaussian": "G",
    "sierpinski": "S",
    "bit": "B",
    "parcel": "P"
}

// Main function
jQuery(function() {
    generatorPath = jQuery("#data-form").attr("action")
    // Initialize the controls
    jQuery("#data-form").submit(formSubmit);
    // Add a new layer when the addLayerButton is clicked
    jQuery("#addLayerButton").click(createDataset);
    // Update the visible inputs based on the distribution type
    jQuery("#distribution").change(hideInputs);
    jQuery("#geometry").change(hideInputs);
    // Validate the form values
    jQuery("#data-form input").change(validateForm)
    jQuery("#data-form select").change(validateForm)
    jQuery("#data-form input").change(saveLayerChanges)
    jQuery("#data-form select").change(saveLayerChanges)
    // Create the map
    initializeMap();
    // If parameters are provided through permalink, use them to populate the on-screen form
    populateFormFromURL();
    validateForm();
    // Create first layer based on the data on the screen
    createDataset();
    // Enable/disable inputs at initialization
    hideInputs();
    // Events for datasets
    jQuery(".layers .deleteButton").click(deleteDataset);
    jQuery(".layers .zoomAllButton").click(zoomAllDataset)
    jQuery(".layers .visibleButton").click(showHideDataset)
    jQuery(".layers input[name=activedataset]").change(activeLayerChanged)
    jQuery("#affine-transform .section-heading").click(showHideAffineTransformation)
});

function showHideAffineTransformation() {
    jQuery("#affine-transform .form-controls").toggleClass("hidden")
    if (jQuery("#affine-transform .form-controls").hasClass("hidden"))
        jQuery("#affine-transform .section-heading").text("Affine matrix (Click to expand)")
    else
        jQuery("#affine-transform .section-heading").text("Affine matrix (Click to hide)")
}

/**
 * Overrides the form submission action and handles it via JavaScript.
 * @param {event} event 
 */
function formSubmit(event) {
    event.preventDefault();
}

/**
 * Update all links on the page for the given layer.
 */
function setLinksForLayer(layer) {
    // Update the direct download link in the layers list
    jQuery(`input[type=radio][value=${layer.id}]`)
        .parents("li")
        .find(".downloadButton")
        .attr("href", createDownloadLink(layer.parameters))
    // Update the permalink
    jQuery(".permalink").text(createPermalink(layer.parameters));
    jQuery(".spark-code").text(createSparkCode(layer.parameters));
    jQuery(".python-code").text(createPythonCode(layer.parameters));    
}

function createPythonCode(parameters) {
    // Update the generation code
    var code = "generator.py ";
    for (key in parameters) {
        var value = parameters[key];
        if (value)
            code += key+"="+value+" ";
    }
    if (parameters.affinematrix)
        code += `affinematrix=${parameters.affinematrix.join(",")}`
    code += " > "+parameters.distribution+"."+parameters.format;
    return code;
}

function createSparkCode(parameters) {
    // Update the generation code
    var code = "import edu.ucr.cs.bdlab.beast._\n"
    code += "import edu.ucr.cs.bdlab.beast.generator._\n"
    code += "val generatedData: SpatialRDD = sparkContext.generateSpatialData(";
    const SparkDistributionNames = {
        "uniform": "UniformDistribution",
        "diagonal": "DiagonalDistribution",
        "parcel": "ParcelDistribution",
        "gaussian": "GaussianDistribution",
        "bit": "BitDistribution",
        "sierpinski": "SierpinskiDistribution"
    }
    code += SparkDistributionNames[parameters.distribution]
    code += ", "
    code += parameters.cardinality + ", \n"
    code += "  opts = Seq("
    const ParameterNames = {
        "dimensions": "SpatialGenerator.Dimensions",
        "seed": "SpatialGenerator.Seed",
        "affinematrix": "SpatialGenerator.AffineMatrix",
        "geometry": "PointBasedGenerator.GeometryType",
        "maxsize": "PointBasedGenerator.MaxSize",
        "percentage": "DiagonalGenerator.Percentage",
        "buffer": "DiagonalGenerator.Buffer",
        "digits": "BitGenerator.Digits",
        "probability": "BitGenerator.Probability",
        "dither": "ParcelGenerator.Dither",
        "srange": "ParcelGenerator.SplitRange"
    }
    for (key in parameters) {
        if (ParameterNames[key]) {
          var value = parameters[key].toString();
          if (value) {
              let numericRegex = /^[\d.-]+$/
            if (numericRegex.exec(value))
              code += `${ParameterNames[key]} -> ${value}, `
            else
              code += `${ParameterNames[key]} -> "${value}", `
          }
        }
    }
    // Remove the last comma
    code = code.substring(0, code.length - 2)
    code += "))"
    return code;
}

function getDatasetById(datasetId) {
    return dataLayers.filter(function(layer) {
        return layer.id == datasetId;
    })[0]
}

/**
 * Populate the form from the currently selected dataset
 */
function activeLayerChanged() {
    var activeLayer = getDatasetById(getActiveDatasetId());
    JSONToForm(activeLayer.parameters)
    highlightActiveLayer();
    // Update the permalink
    jQuery(".permalink").text(createPermalink(activeLayer.parameters));
    jQuery(".spark-code").text(createSparkCode(activeLayer.parameters));
    jQuery(".python-code").text(createPythonCode(activeLayer.parameters));
}

function highlightActiveLayer() {
    var activeDatasetId = getActiveDatasetId();
    jQuery("li.activelayer").removeClass("activelayer")
    jQuery(`input[type=radio][value=${activeDatasetId}]`).parents("li").addClass("activelayer")
}

/**
 * Form a download URL for the data in the form
 */
function createDownloadLink(parameters) {
    // Make a clone to change the parameters
    parameters = Object.assign({}, parameters);
    parameters.compress = "bz2";
    if (parameters.affinematrix)
        parameters.affinematrix = parameters.affinematrix.join(",")
    if (parameters.maxsize)
        parameters.maxsize = parameters.maxsize.join(",")
    if (!parameters.seed)
        parameters.seed = new Date().getTime()
    var downloadURL = generatorPath+"?";
    Object.keys(parameters).forEach(function(key) {
        downloadURL += `${key}=${parameters[key]}&`
    });
    return downloadURL;
}

/**
 * Create a permalink based on the data of the current form
 */
function createPermalink(parameters) {
    var permalink = window.location.origin + window.location.pathname + "?";
    var parts = [];
    parts.push(shortNames[parameters.distribution])
    parts.push(parameters.cardinality)
    parts.push(parameters.dimensions)
    parts.push(parameters.seed)
    if (parameters.distribution != "parcel")
        parts.push(parameters.geometry)
    if (parameters.maxsize)
        parts.push(parameters.maxsize.join(","))
    for (inputName in fEnableObj) {
        if (fEnableObj[inputName] === parameters.distribution)
            parts.push(parameters[inputName])
    }
    if (parameters.affinematrix)
        parts.push(parameters.affinematrix.join(","))
    // Note: No need to use encodeURIComponent since all parameters values are simple (alphanumeric)
    permalink += parts.join("&")
    return permalink;
}

/**
 * Use the URL parameters to populate the form at page load
 */
function populateFormFromURL() {
    var url = window.location.href;
    var queryMarker = url.indexOf("?");
    if (queryMarker != -1) {
        var query = url.substr(queryMarker + 1);
        var params = query.split("&")
        // Set distribution
        var i = 0;
        var distributionShortName = params[i++];
        var distributionLongName;
        for (var name in shortNames) {
            if (shortNames[name] == distributionShortName) {
                jQuery("#distribution").val(name);
                distributionLongName = name;
            }
        }
        // Parse common parameters
        jQuery("input[name=cardinality]").val(params[i++])
        jQuery("input[name=dimensions]").val(params[i++])
        jQuery("input[name=seed]").val(params[i++])
        // Parse the geometry type for non-parcel distribution
        var geometry;
        if (distributionLongName != "parcel")
            geometry = params[i++];
        else
            geometry = "box";
        jQuery("#geometry").val(geometry);
        // Parse the maxsize
        if (distributionLongName != "parcel" && geometry === "box") {
            var maxSizeParts = params[i++].split(",")
            jQuery("input[name='maxsize0']").val(maxSizeParts[0])
            jQuery("input[name='maxsize1']").val(maxSizeParts[1])
        }
        // Parse distribution specific parameters
        for (inputName in fEnableObj) {
            if (fEnableObj[inputName] === distributionLongName)
                jQuery(`input[name=${inputName}]`).val(params[i++])
        }
        if (params[i]) {
            // Parse affineMatrix
            var affineMatrixParts = params[i].split(",")
            for (var j = 1; j <= 6; j++)
                jQuery(`input[name=a${j}]`).val(affineMatrixParts[j-1])
        }
    }
    // Update the visible options based on the distribution selection
    hideInputs();
}

function initializeMap() {
    var view = new ol.View({
        center: [0.5, 0.5],
        zoom: 26,
        minZoom: 0,
        maxZoom: 30
    });
    zoomAllControl = new ol.control.ZoomToExtent({
        extent: [-0.05, -0.05, 1.05, 1.05],
        label: "\uf31e",
        tipLabel: "Zomm to all datasets"
    });
    map = new ol.Map({
        controls: ol.control.defaults().extend([zoomAllControl]),
        target: 'data-content',
        layers: [],
        view: view
    });
}

/**
 * Goes through the list of colors and choose one that is least used
 */
function chooseAvailableColor() {
    // Count how many times each color is used
    var colorUsage = {};
    colorNames.forEach(function(color) {colorUsage[color] = 0; })
    dataLayers.forEach(function(layer) {
        var color = layer.color;
        if (color in colorUsage)
            colorUsage[color] = colorUsage[color] + 1;
        else
            colorUsage[color] = 1;
    });
    // Convert to array and sort by usage
    colorUsage = Object.entries(colorUsage).sort(function(a,b) {return a[1] - b[1]});
    // Return the first color (the one with the least usage)
    return colorUsage[0][0];
}

/**
 * Create a URL that generates data in a form that can be visualized using OpenLayers
 * @param {Object} parameters 
 */
function getVisualizationURL(parameters) {
    var visualizationURL = generatorPath+"?";
    // Make a clone of the parameters to change it without changing the original
    parameters = Object.assign({}, parameters);
    // Override some parameters for visualization (Maximum 1000 records and two dimensions)
    if (parameters.cardinality > 1000)
        parameters.cardinality = 1000;
    if (parameters.dimensions > 2)
        parameters.dimensions = 2;
    parameters.format = "csv";
    if (parameters.affinematrix)
        parameters.affinematrix = parameters.affinematrix.join(",")
    if (parameters.maxsize)
        parameters.maxsize = parameters.maxsize.join(",")
    if (!parameters.seed)
        parameters.seed = new Date().getTime()
    Object.keys(parameters).forEach(function(key) {
        visualizationURL += `${key}=${parameters[key]}&`
    });
    return visualizationURL;
}

/**
 * Create a layer to add in the map for visualizing the given layer object
 * @param {layer} layer 
 */
function createMapLayer(layer) {
    // Create a corresponding layer in the map
    var style = new ol.style.Style({
        image: new ol.style.Circle({
            radius: 2,
            fill: new ol.style.Fill({color: layer['color'] })
        }),
        stroke: new ol.style.Stroke({
            color: layer['color'],
            width: 1
        }), 
      });
    var mapLayer = new ol.layer.Vector({
        style: function() { return style; },
        source: new ol.source.Vector()
    })
    return mapLayer;
}

/**
 * Update the visualization on the screen to match the given parameters
 * @param {MapLayer} mapLayer the layer on the map
 * @param {Object} parameters the parameters to use for the visualization 
 */
function refreshLayerVisualization(mapLayer, parameters) {
    /** Create a point from a CSV line */
    function parsePoint(line) {
        var coordinates = line.split(",").map(function(c) {return parseFloat(c); })
        return new ol.geom.Point(coordinates)
    }
    /**Create a box from a CSV line */
    function parseBox(line) {
        var coordinates = line.split(",").map(function(c) {return parseFloat(c); })
        return new ol.geom.LineString([
            [coordinates[0], coordinates[1]],
            [coordinates[2], coordinates[1]],
            [coordinates[2], coordinates[3]],
            [coordinates[0], coordinates[3]],
            [coordinates[0], coordinates[1]]
        ]);
    }
    // Choose the correct parser based on the geometry type
    var parseGeometry;
    if (parameters.geometry === "point")
        parseGeometry = parsePoint;
    else
        parseGeometry = parseBox;
    // Get the data and use it to update the visualization
    jQuery.get(getVisualizationURL(parameters), function(data) {
        // Data is in CSV format
        var source = mapLayer.getSource();
        source.clear();
        data.split("\n").forEach(function(line) {
            if (line.length > 1) {
                var feature = new ol.Feature({geometry: parseGeometry(line)})
                source.addFeature(feature);
            }
        })
        // Add an MBR that represents the extents of the layer
        var coordinates = [
            [0.0, 0.0],
            [1.0, 0.0],
            [1.0, 1.0],
            [0.0, 1.0],
            [0.0, 0.0]
        ];
        var affineMatrix = parameters.affinematrix;
        if (affineMatrix) {
            coordinates = coordinates.map(function(coord) {
                return affineTransform(coord, affineMatrix);
            });
        }
        var boundary = new ol.geom.LineString(coordinates)
        source.addFeature(new ol.Feature({geometry: boundary}));

        // Update the zoom all button based on all datasets including the newly generated dataset
        updateMapExtents();

        if (firstDataset) {
            map.getView().fit(zoomAllControl.extent)
            firstDataset = false
        }
    })
}

/**
 * 
 * @param {float[2]} point 
 * @param {float[6]} matrix 
 */
function affineTransform(point, matrix) {
    var transformedx = point[0] * matrix[0] + point[1] * matrix[1] + 1 * matrix[2];
    var transformedy = point[0] * matrix[3] + point[1] * matrix[4] + 1 * matrix[5];
    return [transformedx, transformedy];
}

// ----------------- Dataset maintenance
// Add isEmpty function in object
function isEmpty(object) {
    for (var key in object) {
        if (object.hasOwnProperty(key))
            return false;
    }
    return true;
}

/**
 * Create a new dataset from the current values on the screen
 */
function createDataset() {
    // Extract form values into an object and store it in memory
    var dataLayer = {};
    dataLayer.parameters = formToJSON();
    dataLayer.color = chooseAvailableColor();
    dataLayer.mapLayer = createMapLayer(dataLayer);
    if (dataLayers.length == 0)
        dataLayer.id = 1;
    else
        dataLayer.id = dataLayers[dataLayers.length - 1].id + 1
    map.addLayer(dataLayer.mapLayer);
    dataLayers.push(dataLayer);

    // Add a corresponding entry in the layer list control
    var layerItem = jQuery(".layers li.template").clone(true);
    // Customize the items
    layerItem.removeClass("template").removeClass("hidden")
    //layerItem.attr("style", "color: "+dataLayer.color);
    layerItem.find("input[type=radio]").val(dataLayer.id).attr("checked", "checked");
    layerItem.find(".number").attr("style", "background-color: "+dataLayer.color);
    // Add to the page
    jQuery(".layers").append(layerItem);

    // Make the new layer the active layer and highlight it
    highlightActiveLayer();
    // Set layer name
    updateDatasetName(dataLayer);
    // Update the links
    setLinksForLayer(dataLayer)
    // Visualize
    refreshLayerVisualization(dataLayer.mapLayer, dataLayer.parameters);
}

/**
 * Save the current inputs in the screen form to the active layer and refresh the visualization.
 */
function saveLayerChanges() {
    // Update the currently active dataset
    var activeDatasetId = getActiveDatasetId();
    var activeDataset = getDatasetById(activeDatasetId);
    activeDataset.parameters = formToJSON();
    // Update dataset name to reflect the distribution and format
    updateDatasetName(activeDataset);
    // Update the permalink and Python generation code
    setLinksForLayer(activeDataset);
    // Update the visualization
    refreshLayerVisualization(activeDataset.mapLayer, activeDataset.parameters);
}

/**
 * Update the name of the dataset on the list of layers to reflect its distribution and format
 * @param {Dataset} dataset 
 */
function updateDatasetName(dataset) {
    jQuery(`input[type=radio][value=${dataset.id}]`)
        .parents("li")
        .find(".number")
        .text(`#${dataset.id}`)
    jQuery(`input[type=radio][value=${dataset.id}]`)
        .parents("li")
        .find(".name")
        .text(`${dataset.parameters.distribution}.${dataset.parameters.format}`)
}

/**
 * Recalculate the extents of the entire dataset by aggregating all datasets
 */
function updateMapExtents() {
    var extent = [];
    if (dataLayers.length == 0) {
        extent = [0.0, 0.0, 1.0, 1.0];
    } else {
        extent = dataLayers[0].mapLayer.getSource().getExtent();
        // Make a clone
        extent = [...extent]
        for (var i = 1; i < dataLayers.length; i++) {
            var layerExtent = dataLayers[i].mapLayer.getSource().getExtent();
            extent[0] = Math.min(extent[0], layerExtent[0])
            extent[1] = Math.min(extent[1], layerExtent[1])
            extent[2] = Math.max(extent[2], layerExtent[2])
            extent[3] = Math.max(extent[3], layerExtent[3])
        }
    }
    zoomAllControl.extent = extent;
}

function getActiveDatasetId() {
    // -1 to skip the template
    return parseInt(jQuery(".layers input[type=radio]:checked").val());
}

/**
 * Event handler for the delete button
 * @param {*} event 
 */
function deleteDataset(e) {
    var datasetRadio = jQuery(this).parents("li").find("input[type=radio]");
    var deletedDatasetId = parseInt(datasetRadio.val());
    var deletingActiveLayer = datasetRadio.is(":checked");
    var deletedIndex = dataLayers.findIndex(dataset => dataset.id === deletedDatasetId)
    var datasetName = jQuery(this).parents("li").find(".name").text();
    if(!confirm(`Are you sure you want to delete '${datasetName}'?`))
        return;
    // Delete from the list of layers
    var deletedDataset = dataLayers.splice(deletedIndex, 1)[0]

    // Remove from the map
    map.removeLayer(deletedDataset.mapLayer)
    // Remove from the HTML page
    jQuery(this).parents("li").remove();
    if (deletingActiveLayer) {
        var newActiveIndex = deletedIndex;
        if (newActiveIndex >= dataLayers.length)
            newActiveIndex -= 1;
        // Active the dataset at the new index
        // The +2 is because nth-child is one-based and because there is an extra <li> template element
        jQuery(`.layers li:nth-child(${newActiveIndex+2}) input[type=radio]`).prop("checked", true)
        activeLayerChanged()
    }
    e.preventDefault();
}

function zoomAllDataset(e) {
    var datasetRadio  = jQuery(this).parents("li").find("input[type=radio]");
    var datasetId = parseInt(datasetRadio.val());
    map.getView().fit(getDatasetById(datasetId).mapLayer.getSource().getExtent(), {duration: 500})
    e.preventDefault();
}

function showHideDataset() {
    var selectedDatasetId = parseInt(jQuery(this).parents("li").find("input[type=radio]").val());
    var show = jQuery(this).parents("li").find("input[type=checkbox]").prop("checked")
    console.log("show", show)
    show = !show
    jQuery(this).parents("li").find("input[type=checkbox]").prop("checked", show)
    getDatasetById(selectedDatasetId).mapLayer.setVisible(show);
    e.preventDefault();
}

// --------------- Form manipulation

/**
 * Validates the values in the form and display an error message if an error is found
 */
function validateForm() {
    var errorMessages = [];
    const positiveInteger = ["cardinality", "seed", "digits"]
    const zeroToOne = ["srange", "probability", "percentage", "dither"]
    var formValues = formToJSON();
    if (formValues.distribution != "parcel" && formValues.geometry === "box") {
        zeroToOne.push("maxwidth")
        zeroToOne.push("maxheight")
        formValues.maxwidth = formValues.maxsize[0]
        formValues.maxheight = formValues.maxsize[1]
    }
    positiveInteger.forEach(function(key) {
        if (formValues[key]) {
            var value = parseFloat(formValues[key]);
            if (value <= 0 || value != Math.floor(value))
                errorMessages.push(key+" must be positive integer")
        }
    });
    zeroToOne.forEach(function(key) {
        if (formValues[key]) {
            var value = parseFloat(formValues[key]);
            if (value < 0 || value > 1)
                errorMessages.push(key+" must be in the range [0, 1]")
        }
    })
    jQuery(".status-message").html(errorMessages.join("<br/>"))
}

/**
 * Hide input fields that are not applicable to the current distribution
 * and show the ones that are applicable
 */
function hideInputs() {
    var selectedDistribution = jQuery("#distribution").val();
    for (inputName in fEnableObj) {
        var inputField = jQuery(`input[name='${inputName}']`)
        if (fEnableObj[inputName] === selectedDistribution)
            inputField.parent("label").removeClass("hidden")
        else
            inputField.parent("label").addClass("hidden")
    }
    if (selectedDistribution === "parcel") {
        jQuery("#geometry-box").prop("checked", true)
        jQuery("select#geometry").attr("disabled", true)
        jQuery(".inputfield.maxsize").addClass("hidden")
    } else {
        jQuery("select#geometry").attr("disabled", false)
        if (jQuery("#geometry").val() == "box") {
            jQuery(".inputfield.maxsize").removeClass("hidden")
        } else {
            jQuery(".inputfield.maxsize").addClass("hidden")
        }
    }
}

/**
 * Convert the form information into a JavaScript object
 */
function formToJSON() {
    var distribution = jQuery("#distribution").val();
    var parameters = {};
    jQuery("#data-form").serializeArray().forEach(function(kv){ 
            var parameterName = kv['name'];
            var parameterValue = kv['value'];
            if (!fEnableObj[parameterName] || fEnableObj[parameterName] === distribution)
                parameters[parameterName] = parameterValue; 
        });
    // Convert the affineMatrix to an easier form to use
    var affineMatrix = [];
    for (var i = 1; i <= 6; i++) {
        if (parameters["a"+i])
            affineMatrix.push(parseFloat(parameters["a"+i]))
        delete parameters["a"+i]
    }
    // All parameters have to be defined to use the affine matrix
    if (affineMatrix.length == 6)
        parameters["affinematrix"] = affineMatrix;
    
    if (distribution != "parcel" && parameters.geometry === "box") {
        // Need to parse the max size
        parameters.maxsize = [parseFloat(parameters.maxsize0), parseFloat(parameters.maxsize1)]
    }
    delete parameters.maxsize0;
    delete parameters.maxsize1;
    return parameters;
}

/**
 * Convert the given JSON object that contains parameters to the form
 * @param {object} paramVals 
 */
function JSONToForm(paramVals) {
    if (!paramVals.affinematrix) {
        // Reset the affine matrix
        for (var i = 1; i <= 6; i++)
            jQuery(`input[name=a${i}]`).val("");
    }
    for (var key in paramVals) {
        if (key === "affinematrix") {
            var affineMatrix = paramVals[key];
            for (var i = 1; i <= 6; i++) 
                jQuery(`input[name=a${i}]`).val(affineMatrix[i - 1]);
        } else if (key === "maxsize") {
            var maxsize = paramVals[key];
            console.log("maxsize", maxsize)
            for (var i = 0; i <= 1; i++)
                jQuery(`input[name=maxsize${i}]`).val(maxsize[i]);
        } else if (key === "geometry" || key == "distribution") {
            jQuery(`select[name=${key}]`).val(paramVals[key])
        } else {
            jQuery(`input[name=${key}]`).val(paramVals[key])
        }
    }
    hideInputs();
}
