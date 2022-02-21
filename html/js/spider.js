//seeded random generator
var rng;
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
    generatorPath = jQuery("#data-form").attr("action");
    // Initialize the controls
    jQuery("#data-form").submit(formSubmit);
    // Add a new layer when the addLayerButton is clicked
    jQuery("#addLayerButton").click(createDataset);
    // Update the visible inputs based on the distribution type
    jQuery("#distribution").change(hideInputs);
    jQuery("#geometry").change(hideInputs);
    // Validate the form values
    jQuery("#data-form input").change(validateForm);
    jQuery("#data-form select").change(validateForm);
    jQuery("#data-form input").change(saveLayerChanges);
    jQuery("#data-form select").change(saveLayerChanges);
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
    jQuery(".layers .zoomAllButton").click(zoomAllDataset);
    jQuery(".layers .visibleButton").click(showHideDataset);
    jQuery(".layers input[name=activedataset]").change(activeLayerChanged);
    jQuery("#affine-transform .section-heading").click(showHideAffineTransformation);
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
    code += "val generatedData: SpatialRDD = sc.generateSpatialData\n";
    const SparkDistributionNames = {
        "uniform": "UniformDistribution",
        "diagonal": "DiagonalDistribution",
        "parcel": "ParcelDistribution",
        "gaussian": "GaussianDistribution",
        "bit": "BitDistribution",
        "sierpinski": "SierpinskiDistribution"
    }
    code += "  .distribution("+SparkDistributionNames[parameters.distribution]+")\n"
    const ParameterNames = {
        "dimensions": "SpatialGenerator.Dimensions",
        "seed": "SpatialGenerator.Seed",
        "affinematrix": "SpatialGenerator.AffineMatrix",
        "geometry": "UniformDistribution.GeometryType",
        "maxsize": "UniformDistribution.MaxSize",
        "maxseg": "UniformDistribution.MaxSeg",
        "polysize": "UniformDistribution.PolySize",
        "percentage": "DiagonalDistribution.Percentage",
        "buffer": "DiagonalDistribution.Buffer",
        "digits": "BitDistribution.Digits",
        "probability": "BitDistribution.Probability",
        "dither": "ParcelDistribution.Dither",
        "srange": "ParcelDistribution.SplitRange"
    }
    for (key in parameters) {
        if (ParameterNames[key]) {
          var value = parameters[key];
          if (value) {
            if (key === "affinematrix") {
              // Adjust the affine matrix to match the Scala implementation
              // Matrix transpose
              value = [value[0], value[3], value[1], value[4], value[2], value[5]]
            }
            let numericRegex = /^[\d.-]+$/
            if (numericRegex.exec(value.toString()))
              code += `  .config(${ParameterNames[key]}, ${value})\n`
            else
              code += `  .config(${ParameterNames[key]}, "${value}")\n`
          }
        }
    }
    // Remove the last comma
    code += `  .generate(cardinality=${parameters.cardinality})`
    return code;
}

function getDatasetById(datasetId) {
    return dataLayers.filter(function(layer) {
        return layer.id == datasetId;
    })[0]
}

/**
 * Populate the form from the currently selected dataset.
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
 * Form a download URL for the data in the form.
 */
function createDownloadLink(parameters) {
    // Make a clone to change the parameters
    parameters = Object.assign({}, parameters);
    parameters.compress = "bz2";
    if (parameters.affinematrix)
        parameters.affinematrix = parameters.affinematrix.join(",")
        
        if (parameters.geometry === "box") {
            if (parameters.maxsize)
                parameters.maxsize = parameters.maxsize.join(",") 
        }
        
    if (!parameters.seed)
        parameters.seed = new Date().getTime()
    rng = new Math.seedrandom(parameters.seed);
    var downloadURL = generatorPath+"?";
    Object.keys(parameters).forEach(function(key) {
        downloadURL += `${key}=${parameters[key]}&`
    });
    return downloadURL;
}

/**
 * Create a permalink based on the data of the current form.
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
    if (parameters.geometry === "box") {
        if (parameters.maxsize)
            parts.push(parameters.maxsize.join(","))  
    }
    
    if (parameters.geometry === "polygon") {
        if (parameters.polysize)
            parts.push(parameters.polysize)
       if (parameters.maxseg)
            parts.push(parameters.maxseg) 
    }
    
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
 * Use the URL parameters to populate the form at page load.
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
        var distributionFound = false;
        for (var name in shortNames) {
            if (shortNames[name] == distributionShortName) {
                jQuery("#distribution").val(name);
                distributionLongName = name;
                distributionFound = true;
            }
        }
        if (!distributionFound)
            return;
        // Parse common parameters
        jQuery("input[name=cardinality]").val(params[i++])
        jQuery("input[name=dimensions]").val(params[i++])
        jQuery("input[name=seed]").val(params[i++])
        // Parse the geometry type for non-parcel distribution
        var geometry;
        if (distributionLongName != "parcel")
            geometry = params[i++];
        else if (distributionLongName === "box")
            geometry = "box";
        else if (distributionLongName === "polygon")
            geometry = "polygon"
        jQuery("#geometry").val(geometry);
        // Parse the maxsize
        if (distributionLongName != "parcel" && geometry === "box") {
            var maxSizeParts = params[i++].split(",")
            jQuery("input[name='maxsize0']").val(maxSizeParts[0])
            jQuery("input[name='maxsize1']").val(maxSizeParts[1])
        }
        if (distributionLongName != "parcel" && geometry === "polygon") {
            var polyParts = params[i++].split(",")
            jQuery("input[name='polysize']").val(polyParts[0])
            jQuery("input[name='maxseg']").val(polyParts[1])
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
 * Goes through the list of colors and choose one that is least used.
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
 * Create a layer to add in the map for visualizing the given layer object.
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
 * Update the visualization on the screen to match the given parameters.
 * @param {MapLayer} mapLayer the layer on the map
 * @param {Object} parameters the parameters to use for the visualization 
 */
 function refreshLayerVisualization(mapLayer, parameters) {

    //Window dimensions for customized cardinality upper limits
    var windowWidth = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
    var windowHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
    
    var cardinalityLimit = 10000; // Cardinality limit defaults to 10,000
    if (windowHeight < 775 || windowWidth < 950){ // Smaller screen have cardinality capped at 1000
        cardinalityLimit = 1000;
    }

    // Make a clone of the parameters to change it without changing the original
    parameters = Object.assign({}, parameters);
    // Override some global parameters for visualization (Maximum 10000 records and two dimensions)
    parameters.format = "csv";
    if (parameters.cardinality > cardinalityLimit){
        parameters.cardinality = cardinalityLimit;
    }
    if (parameters.dimensions > 2){
        parameters.dimensions = 2;
    }
    if (parameters.affinematrix){
        parameters.affinematrix = parameters.affinematrix.join(",");
    }
    if (parameters.maxsize){
        parameters.maxsize = parameters.maxsize.join(",");
    }
    //ADDED FOR POLYGON
    if(parameters.polysize){
        parameters.polysize = parameters.polysize;
    }
    if(parameters.maxseg){
        parameters.maxseg = parameters.maxseg;
    }
    if (!parameters.seed){
        parameters.seed = new Date().getTime();
    }

    rng = new Math.seedrandom(parameters.seed);

    var source = mapLayer.getSource();
    source.clear();

    var generator = createGenerator(parameters);
    generator.generate(source, parameters);

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
        affineMatrix = parameters.affinematrix.split(",").map(function(c) {return parseFloat(c)});
        coordinates = coordinates.map(function(coord) {
            return affineTransform(coord, affineMatrix);
        });
    }

    var boundary = new ol.geom.LineString(coordinates);
    source.addFeature(new ol.Feature({geometry: boundary}));

    // Update the zoom all button based on all datasets including the newly generated dataset
    updateMapExtents();

    if (firstDataset) {
        map.getView().fit(zoomAllControl.extent);
        firstDataset = false;
    }
}

/**
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
 * Create a new dataset from the current values on the screen.
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
 * Recalculate the extents of the entire dataset by aggregating all datasets.
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
 * Event handler for the delete button.
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

function showHideDataset(e) {
    var selectedDatasetId = parseInt(jQuery(this).parents("li").find("input[type=radio]").val());
    var show = jQuery(this).parents("li").find("input[type=checkbox]").prop("checked")
    show = !show
    jQuery(this).parents("li").find("input[type=checkbox]").prop("checked", show)
    getDatasetById(selectedDatasetId).mapLayer.setVisible(show);
    e.preventDefault();
}

// --------------- Form manipulation

/**
 * Validates the values in the form and display an error message if an error is found.
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
    if (formValues.distribution != "parcel" && formValues.geometry === "polygon") {
        positiveInteger.push("maxseg")
        zeroToOne.push("polysize")
        formValues.maxseg = formValues.maxseg[0]
        formValues.polysize = formValues.polysize[1]
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
            if (key == "srange" && (value < 0 || value > 0.5)){
                errorMessages.push(key+" must be in the range [0, 0.5]")
            }
            else if (value < 0 || value > 1)
                errorMessages.push(key+" must be in the range [0, 1]")
        }
    })
    jQuery(".status-message").html(errorMessages.join("<br/>"))
}

/**
 * Hide input fields that are not applicable to the current distribution.
 * and show the ones that are applicable.
 */
function hideInputs() {
    var selectedDistribution = jQuery("#distribution").val();
    for (inputName in fEnableObj) {
        var inputField = jQuery(`input[name='${inputName}']`);
        if (fEnableObj[inputName] === selectedDistribution)
            inputField.parent("label").removeClass("hidden");
        else
            inputField.parent("label").addClass("hidden");
    }
    if (selectedDistribution === "parcel") {
        jQuery("#geometry-box").prop("checked", true);
        jQuery("select#geometry").attr("disabled", true);
        jQuery(".inputfield.maxsize").addClass("hidden");
        jQuery(".inputfield.polysize").addClass("hidden");
        jQuery(".inputfield.maxseg").addClass("hidden");
    } else {
        jQuery("select#geometry").attr("disabled", false)
        if (jQuery("#geometry").val() == "box") {
            jQuery(".inputfield.maxsize").removeClass("hidden");
            jQuery(".inputfield.polysize").addClass("hidden");
            jQuery(".inputfield.maxseg").addClass("hidden");
        } else if (jQuery("#geometry").val() == "polygon") {
            jQuery(".inputfield.polysize").removeClass("hidden");
            jQuery(".inputfield.maxseg").removeClass("hidden");
            jQuery(".inputfield.maxsize").addClass("hidden");
        } else {
            jQuery(".inputfield.maxsize").addClass("hidden");
            jQuery(".inputfield.polysize").addClass("hidden");
            jQuery(".inputfield.maxseg").addClass("hidden");
        }
    }
}

/**
 * Convert the form information into a JavaScript object.
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
 * Convert the given JSON object that contains parameters to the form.
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

/**
 * Generate a random number in the range (num1, num2).
 * @param {float} num1
 * @param {float} num2
 */
function uniform(num1, num2){
    return rng.quick() * Math.abs(num1 - num2) + Math.min(num1, num2);
}

/**
 * Generate a random number from a Bernoulli distribution
 * @param {float} p
 */
function bernoulli(p){
    if (rng.quick() < p) {
        return 1;
    }
    else {
        return 0;
    }
}

/**
 * Generate a random number from a normal distribution with the given mean and standard deviation.
 * @param {float} mu
 * @param {float} sigma
 */
function normal(mu, sigma){
    return mu + sigma * Math.sqrt(-2 * Math.log(rng.quick())) * Math.sin(2 * Math.PI * rng.quick());
}

/**
 * Generate a random integer number in the range [1, n]
 * @param {float} n
 */
function dice(n){
    return Math.floor(rng.quick() * n) + 1;
}

/**
 * Base class for all data generators.
 * @constructor
 */
class Generator{

    /**
     * @param {int} cardinality
     * @param {int} dimensions
     */
    constructor(cardinality, dimensions){
        this.cardinality = cardinality;
        this.dimensions = dimensions;
    }

    /**
     * Parses and sets the affine matrix as class member.
     * @param {object} parameters
     */
    setAffineMatrix(parameters){
        this.affineMatrix = parameters.affinematrix;
        if (this.affineMatrix){
            this.affineMatrix = parameters.affinematrix.split(",").map(function(c) {return parseFloat(c)});
        }
    }

    /**
     * Check if a point is valid.
     * @param {object} point
     * @returns {boolean}
     */
    isValidPoint(point){
        for (const x of point){
            if (x < 0 || x > 1){
                return false;
            }
        }
        return true;
    }

    //abstract
    generate(source, parameters){
        throw "Using abstract function";
    }

    /**
     * Creates box given min and max coordinates from point.
     * @param {object} minCoordinates
     * @param {object} maxCoordinates
     * @returns {feature} openlayers feature
     */
    pointToBox(minCoordinates, maxCoordinates){
        var coordinates = [];
        for (let i = 0; i < minCoordinates.length; i++) {
            coordinates.push(minCoordinates[i]);
        }
        for (let i = 0; i < maxCoordinates.length; i++) {
            coordinates.push(maxCoordinates[i]);
        }
        //use this line to create a polygon
        var feature = new ol.Feature({
            geometry: new ol.geom.LineString([
                [coordinates[0], coordinates[1]],
                [coordinates[2], coordinates[1]],
                [coordinates[2], coordinates[3]],
                [coordinates[0], coordinates[3]],
                [coordinates[0], coordinates[1]]
            ])
        });
        return feature;
    }
}

/**
 * Base class for all uniform, diagonal, guassian, sierpinski, and bit generators. 
 * @constructor
 * @extends Generator
 */
class DataGenerator extends Generator{

    /**
     * @param {int} cardinality
     * @param {int} dimensions
     */
    constructor(cardinality, dimensions){
        super(cardinality, dimensions);
    }
    
    //abstract
    generatePoint(i, prevpoint){
        throw "Using abstract function";
    }

    transform(angle) {
        var distance = uniform(0, parameters.polysize)
        var x = center[0] + parameters.polysize * Math.cos(angle);
        var y = center[1] + parameters.polysize * Math.sin(angle);
        //returns the x and y array
        if (this.affineMatrix) {
            return points = affineTransform([x, y], this.affineMatrix);
        } else {
            return [x, y]
        }
    }
    /**
     * Generates data and displays it on to the screen.
     * @param {object} source
     * @param {object} parameters
     */
    generate(source, parameters){
        let i = 0;
        var prevpoint = null;
        this.setAffineMatrix(parameters);

        while (i < this.cardinality){
            var newpoint = this.generatePoint(i, prevpoint);
            if (this.isValidPoint(newpoint)) {
                var feature;
                if (parameters.geometry == "point") {
                    if (this.affineMatrix) {
                        newpoint = affineTransform(newpoint, this.affineMatrix);
                    }
                    feature = new ol.Feature({ geometry: new ol.geom.Point(newpoint) });
                }
                else if (parameters.geometry == "box"){
                    var minCoordinates = [];
                    var maxCoordinates = [];
                    for (let d = 0; d < newpoint.length; d++){
                        var maxsize = parameters.maxsize.split(",").map(function(c) {return parseFloat(c)});
                        let size = uniform(0, maxsize[d]);
                        minCoordinates.push(newpoint[d] - size);
                        maxCoordinates.push(newpoint[d] + size);


                    }
                    //fix this to take the min and max vals and then transform the matrix

                    if (this.affineMatrix) {
                        minCoordinates = affineTransform(minCoordinates, this.affineMatrix);
                        maxCoordinates = affineTransform(maxCoordinates, this.affineMatrix);

                    }
                    feature = this.pointToBox(minCoordinates, maxCoordinates);
                } else if (parameters.geometry == "polygon") {
                    if (parameters.dimensions != 2) {
                        console.log("error: expected 2 dimensions, got", parameters.dimensions);
                    }

                    var center = this.generatePoint();
                    console.log(parameters);
                    var minSegs = 3;
                    //generates a random num between user inputted max and const minSeg-> then add minSegs back
                    var numSegments;
                    if (parameters.maxseg <= 3) {
                        numSegments = minSegs;
                    } else {
                        numSegments = dice(parameters.maxseg - minSegs) + minSegs;
                    }
                    
                    var angles = [];
                    //fills array with random angles
                    for (var increment = 0; increment < numSegments; ++increment) {
                        angles.push(uniform(0, Math.PI * 2));
                    }

                    //a random array of angles
                    angles = angles.sort();

                    //creates a new array that will be filled with the x and y coordinates so that it can generate a point
                    var points = angles.map(angle => {
                        var distance = uniform(0, parameters.polysize)

                        var x = center[0] + parameters.polysize * Math.cos(angle);
                        var y = center[1] + parameters.polysize * Math.sin(angle);
                        //returns the x and y array
                        if (this.affineMatrix) {
                            return points = affineTransform([x, y], this.affineMatrix);
                        } else {
                            return [x, y]
                        }
                    })

                    //adds the last point to connect the line segments of the polygon
                    points.push(points[0]);
                    //draws the polygon
                    feature = new ol.Feature({ geometry: new ol.geom.LineString(points) });


                }


                source.addFeature(feature); //write feature to the screen
                prevpoint = newpoint;
                i += 1;
            }
        }
    }
}

/**
 * Generates uniformly distributed points.
 * @constructor
 * @extends DataGenerator
 */
class UniformGenerator extends DataGenerator {

    /**
     * @param {int} cardinality
     * @param {int} dimensions
     */
    constructor(cardinality, dimensions){
        super(cardinality, dimensions);
    }

    /**
     * Generates a single point based on uniform distribution.
     * @param {int} i
     * @param {object} prev_point
     * @returns {Array[int]} point as Array[int]
     */
    generatePoint(i, prev_point){
        let arr = [];
        for (let d = 0; d < this.dimensions; d++){
            arr.push(rng.quick());
        }
        return arr;
    }
}

/**
 * Generates points from a diagonal distribution.
 * @constructor
 * @extends DataGenerator
 */
class DiagonalGenerator extends DataGenerator {

    /**
     * @param {int} cardinality
     * @param {int} dimensions
     */
    constructor(cardinality, dimensions, percentage, buffer){
        super(cardinality, dimensions);
        this.percentage = percentage;
        this.buffer = buffer;
    }

    /**
     * Generates a single point based on diagonal distribution.
     * @param {int} i
     * @param {object} prev_point
     * @returns {Array[int]} point as Array[int]
     */
    generatePoint(i, prev_point){
        let arr = [];
        if (bernoulli(this.percentage) == 1){
            let r = rng.quick();
            for (let d = 0; d < this.dimensions; d++){
                arr.push(r);
            }
            return arr;
        }
        else {
            let c = rng.quick();
            let d = normal(0, this.buffer / 5);
            for (let x = 0; x < this.dimensions; x++){
                arr.push((c + (1 - 2 * (x % 2)) * d / Math.sqrt(2)));
            }
            return arr;
        }
    }
}

/**
 * Generates Gaussian distributed points
 * @constructor
 * @extends DataGenerator
 */
class GaussianGenerator extends DataGenerator {
    
    /**
     * @param {int} cardinality
     * @param {int} dimensions
     */
    constructor(cardinality, dimensions){
        super(cardinality, dimensions);
    }

    /**
     * Generates a single point based on Gaussian distribution.
     * @param {int} i
     * @param {object} prev_point
     * @returns {Array[int]} point as Array[int]
     */
    generatePoint(i, prev_point){
        let arr = [];
        for (let d = 0; d < this.dimensions; d++){
            arr.push(normal(0.5, 0.1));
        }
        return arr;
    }
}

/**
 * Generates Sierpinski distributed points
 * @constructor
 * @extends DataGenerator
 */
class SierpinskiGenerator extends DataGenerator {

    /**
     * @param {int} cardinality
     * @param {int} dimensions
     */
    constructor(cardinality, dimensions){
        super(cardinality, dimensions);
    }

    /**
     * Generates a single point based on Sierpinski distribution.
     * @param {int} i
     * @param {object} prev_point
     * @returns {Array[int]} point as Array[int]
     */
    generatePoint(i, prev_point){
        if (i == 0){
            return [0.0, 0.0];
        }
        else if (i == 1){
            return [1.0, 0.0];
        }
        else if (i == 2){
            return [0.5, Math.sqrt(3) / 2];
        }
        else {
            let d = dice(5);
            if (d == 1 || d == 2){
                return this.getMiddlePoint(prev_point, [0.0, 0.0]);
            }
            else if (d == 3 || d == 4){
                return this.getMiddlePoint(prev_point, [1.0, 0.0]);
            }
            else {
                return this.getMiddlePoint(prev_point, [0.5, Math.sqrt(3) / 2]);
            }
        }
    }

    /**
     * Finds the middle point of 2 points passed in.
     * @param {object} point1
     * @param {object} point2
     * @returns {Array[int]} point as Array[int]
     */
    getMiddlePoint(point1, point2){
        let arr = [];
        for (let i = 0; i < point1.length; i++){
            arr.push((point1[i] + point2[i]) / 2);
        }
        return arr;
    }
}

/**
 * Generates points from a bit distribution
 * @constructor
 * @extends DataGenerator
 */
 class BitGenerator extends DataGenerator {

    /**
     * @param {int} cardinality
     * @param {int} dimensions
     */
    constructor(cardinality, dimensions, probability, digits){
        super(cardinality, dimensions);
        this.probability = probability;
        this.digits = digits;
    }

    /**
     * Generates a single point based on Bit distribution.
     * @param {int} i
     * @param {object} prev_point
     * @returns {Array[int]} point as Array[int]
     */
    generatePoint(i, prev_point){
        let arr = [];
        for (let d = 0; d < this.dimensions; d++){
            arr.push(this.bit());
        }
        return arr;
    }

    /**
     * Generates a bit number using bernoulli random number and digits.
     * @returns {float}
     */
    bit(){
        var num = 0.0;
        for (let i = 0; i < this.digits; i++){
            var c = bernoulli(this.probability);
            num = num + c / Math.pow(2, i + 1);
        }
        return num;
    }
}

/**
 * A two-dimensional box with depth field. Used with the parcel generator
 * @constructor
 */
class BoxWithDepth {

    /**
     * @param {int} depth
     * @param {float} x
     * @param {float} y
     * @param {float} width
     * @param {float} height
     */
    constructor(depth, x, y, width, height){
        this.depth = depth; //int
        this.x = x; //float
        this.y = y; //float
        this.w = width; //float
        this.h = height; //float
    }
}

/**
 * Generates points from a parcel distribution. Only supports boxes.
 * @constructor
 * @extends Generator
 */
class ParcelGenerator extends Generator{

    /**
     * @param {int} cardinality
     * @param {int} dimensions
     */
    constructor(cardinality, dimensions, split_range, dither){
        super(cardinality, dimensions);
        this.split_range = split_range;
        this.dither = dither;
    }

    /**
     * Generates Parcel Generator boxes.
     * @param {object} source
     * @param {object} parameters
     */
    generate(source, parameters){
        // Using dataclass to create BoxWithDepth, which stores depth of each box in the tree
        // Depth is used to determine at which level to stop splitting and start printing    
        let box = new BoxWithDepth(0, 0.0, 0.0, 1.0, 1.0);
        var boxes = [];
        boxes.push(box);

        var max_height = Math.ceil(Math.log2(this.cardinality));

        // We will print some boxes at last level and the remaining at the second to last level 
        // Number of boxes to split on the second to last level
        var numToSplit = this.cardinality - Math.pow(2, Math.max(max_height - 1, 0));
        var numSplit = 0;
        var boxes_generated = 0;

        while (boxes_generated < this.cardinality){

            var b = boxes.pop();

            if (b.depth >= (max_height - 1)){
                if (numSplit < numToSplit){ //Split at second to last level and print the new boxes
                    let splitBoxes = this.split(b);
                    numSplit += 1;
                    this.ditherAndPrint(splitBoxes[0], source, parameters);
                    this.ditherAndPrint(splitBoxes[1], source, parameters);
                    boxes_generated += 2;
                }
                else { //Print remaining boxes from the second to last level 
                    this.ditherAndPrint(b, source, parameters);
                    boxes_generated += 1;
                }
            }
            else {
                let splitBoxes = this.split(b);
                boxes.push(splitBoxes[0]);
                boxes.push(splitBoxes[1]);
            }
        }
    }

    /**
     * Splits BoxWithDepth into 2, depending on width and height.
     * @param {BoxWithDepth} b
     * @returns {Array[BoxWithDepth]} Array of 2 Boxes
     */
    split(b){
        if (b.w > b.h){
            // Split vertically if width is bigger than height
            let split_size = b.w * uniform(this.split_range, 1 - this.split_range);
            var b1 = new BoxWithDepth(b.depth + 1, b.x, b.y, split_size, b.h);
            var b2 = new BoxWithDepth(b.depth + 1, b.x + split_size, b.y, b.w - split_size, b.h);
        }
        else {
            // Split horizontally if width is less than height
            let split_size = b.h * uniform(this.split_range, 1 - this.split_range);
            var b1 = new BoxWithDepth(b.depth + 1, b.x, b.y, b.w, split_size);
            var b2 = new BoxWithDepth(b.depth + 1, b.x, b.y + split_size, b.w, b.h - split_size);
        }
        let splitBoxes = [];
        splitBoxes.push(b1);
        splitBoxes.push(b2);
        return splitBoxes;
    }

    /**
     * Dithers BoxWithDepth and displays box to screen.
     * @param {BoxWithDepth} b
     * @param {object} source
     * @param {object} parameters
     */
    ditherAndPrint(b, source, parameters){
        let ditherX = b.w * uniform(0.0, this.dither);
        b.x += ditherX / 2;
        b.w -= ditherX;
        let ditherY = b.h * uniform(0.0, this.dither);
        b.y += ditherY / 2;
        b.h -= ditherY;

        var minCoordinates = [b.x, b.y];
        var maxCoordinates = [b.x + b.w, b.y + b.h];

        this.setAffineMatrix(parameters);
        if (this.affineMatrix){
            minCoordinates = affineTransform(minCoordinates, this.affineMatrix);
            maxCoordinates = affineTransform(maxCoordinates, this.affineMatrix);
        }

        var feature = this.pointToBox(minCoordinates, maxCoordinates);
        source.addFeature(feature);
    }

    generatePoint(i, prev_point){
        throw "Cannot generate points with the ParcelGenerator";
    }
}

/**
 * Selects a generator to use based on parameters.
 * Checks bounds of generator specific parameters.
 * @param {object} parameters
 * @returns {Generator} correct type of generator
 */
 function createGenerator(parameters) {
    var generator = null;

    if (parameters.distribution == "uniform"){
        generator = new UniformGenerator(parameters.cardinality, parameters.dimensions);
    }
    else if (parameters.distribution == "diagonal"){
        if (parameters.percentage < 0){
            parameters.percentage = 0;
        }
        else if (parameters.percentage > 1){
            parameters.percentage = 1;
        }

        if (parameters.buffer < 0){
            parameters.buffer = 0;
        }
        else if (parameters.buffer > 1){
            parameters.buffer = 1;
        }

        generator = new DiagonalGenerator(parameters.cardinality, parameters.dimensions, parameters.percentage, parameters.buffer);
    }
    else if (parameters.distribution == "gaussian"){
        generator = new GaussianGenerator(parameters.cardinality, parameters.dimensions);
    }
    else if (parameters.distribution == "sierpinski"){
        generator = new SierpinskiGenerator(parameters.cardinality, parameters.dimensions);
    }
    else if (parameters.distribution == "bit"){
        if (parameters.probability < 0){
            parameters.probability = 0;
        }
        else if (parameters.probability > 1){
            parameters.probability = 1;
        }

        if (parameters.digits < 0){
            parameters.digits = 0;
        }

        generator = new BitGenerator(parameters.cardinality, parameters.dimensions, parameters.probability, parameters.digits);
    }
    else if (parameters.distribution == "parcel"){
        if (parameters.srange < 0){
            parameters.srange = 0;
        }
        else if (parameters.srange > 0.5){
            parameters.srange = 0.5;
        }

        if (parameters.dither < 0){
            parameters.dither = 0;
        }
        else if (parameters.dither > 1){
            parameters.dither = 1;
        }

        generator = new ParcelGenerator(parameters.cardinality, parameters.dimensions, parameters.srange, parameters.dither);
    }

    return generator;
}