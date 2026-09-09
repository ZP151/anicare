const { withXcodeProject, IOSConfig } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');
module.exports = function withApplePlaceSearch(config) {
  return withXcodeProject(config, c => {
    const name = c.modRequest.projectName;
    const relative = `${name}/WhiskerPlaceSearch.mm`;
    fs.copyFileSync(path.join(__dirname, 'WhiskerPlaceSearch.mm'), path.join(c.modRequest.platformProjectRoot, relative));
    if (!c.modResults.hasFile(relative)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath: relative, groupName: name, project: c.modResults });
    }
    return c;
  });
};
