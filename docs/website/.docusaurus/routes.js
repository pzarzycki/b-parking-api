import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/b-parking-api/api-reference/',
    component: ComponentCreator('/b-parking-api/api-reference/', '90f'),
    exact: true,
    configuration: "{\n        \"_integration\": \"docusaurus\",\n        \"url\": \"/b-parking-api/openapi.yaml\",\n        \"hideClientButton\": true,\n        \"hideTestRequestButton\": true,\n        \"showDeveloperTools\": \"never\",\n        \"agent\": {\n          \"disabled\": true\n        },\n        \"hideDarkModeToggle\": true\n      }"
  },
  {
    path: '/b-parking-api/',
    component: ComponentCreator('/b-parking-api/', 'c52'),
    routes: [
      {
        path: '/b-parking-api/',
        component: ComponentCreator('/b-parking-api/', '9a2'),
        routes: [
          {
            path: '/b-parking-api/',
            component: ComponentCreator('/b-parking-api/', '083'),
            routes: [
              {
                path: '/b-parking-api/database-schema/',
                component: ComponentCreator('/b-parking-api/database-schema/', 'd89'),
                exact: true,
                sidebar: "documentationSidebar"
              },
              {
                path: '/b-parking-api/floor-plans/',
                component: ComponentCreator('/b-parking-api/floor-plans/', '89b'),
                exact: true,
                sidebar: "documentationSidebar"
              },
              {
                path: '/b-parking-api/',
                component: ComponentCreator('/b-parking-api/', '12b'),
                exact: true,
                sidebar: "documentationSidebar"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    path: '*',
    component: ComponentCreator('*'),
  },
];
