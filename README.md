# Spatial Data Generators
This repository provides the implementation for Spatial Data Generators paper, which was presented in 1st ACM SIGSPATIAL International Workshop on Spatial Gems (SpatialGems 2019, https://www.spatialgems.net/). \
This is a Python implementation. You can find a Ruby implementation [here](https://github.com/aseldawy/spatialdatagenerators).

## How to use it?
Show the help for detail information
```
python3 generator.py -h
```

## Sample
Six kinds of supported distribution. Please feel free to contact us if you want to have other spatial distributions.

![alt text](demo/sample.png)

## Web demonstration
Spider is deployed as a web application at [https://spider.cs.ucr.edu] where you can visualize and download the datasets.

## Instructions to run locally
Make sure that Python3 is installed. The following command runs the generator.
```shell
python3 html/cgi/generator.py
```
The parameters are generally specified as a set of `key=value` pairs. The possible keys and their usage is described below.

- *distribution*: {uniform, diagonal, gaussian, parcel, bit, sierpinski}
- *cardinality*: Number of geometries to generate
- *dimensions*: Number of dimensions in generated geometries
- *geometry*: {point, box}. If geometry type is `box` and the distribution is NOT `parcel`, you have to specify the maxsize property
maxsize: maximum size along each dimension (before transformation), e.g., 0.2,0.2 (no spaces)
percentage: (for diagonal distribution) the percentage of records that are perfectly on the diagonal
buffer: (for diagonal distribution) the buffer around the diagonal that additional points can be in
srange: (for parcel distribution) the split range [0.0, 1.0]
dither: (for parcel distribution) the amound of noise added to each record as a perctange of its initial size [0.0, 1.0]
affinematrix: (optional) values of the affine matrix separated by comma. Number of expected values is d*(d+1) where d is the number of dimensions
compress: (optional) { bz2 }
format: output format { csv, wkt, geojson }
[affine matrix] (Optional) Affine matrix parameters to apply to all generated geometries

## Instructions to install on Apache Tomcat as a web service
### Prerequisites
1. Python3
2. Java Runtime Environment (JRE)

### Steps
1. Install [Apache Tomcat](https://tomcat.apache.org/download-90.cgi). Assume it is installed to `$CATALINA_HOME`
2. Enable [CGI scripting](http://tomcat.apache.org/tomcat-9.0-doc/cgi-howto.html). Edit `$CATALINA_HOME/conf/web.xml`. Uncomment the following sections:
```xml
<servlet-mapping>
    <servlet-name>cgi</servlet-name>
    <url-pattern>/cgi/*</url-pattern>
</servlet-mapping>
...
<servlet>
    <servlet-name>cgi</servlet-name>
    <servlet-class>org.apache.catalina.servlets.CGIServlet</servlet-class>
    <init-param>
        <param-name>cgiPathPrefix</param-name>
        <param-value>WEB-INF/cgi</param-value>
    </init-param>
    <load-on-startup>5</load-on-startup>
</servlet>
```
3. Edit `$CATALINA_HOME/conf/context.xml` and add `privileged="true"` at the `<Context>` element so that it looks as follows.
```xml
<Context privileged="true">
...
</Context>
```
4. Copy the `html` directory from the source code to `$CATALINA_HOME/webapps/ROOT/spider`.
You can do that by running the following command at the source root `rsync -av html/ $CATALINA_HOME/webapps/ROOT/spider`
5. Copy the `html/cgi/generator.py` file to `$CATALINA_HOME/webapps/ROOT/cgi/generator.py`. You can do that by running the command `rsync -av html/cgi/ $CATALINA_HOME/webapps/ROOT/WEB-INF/cgi`
6. Restart Tomcat server.