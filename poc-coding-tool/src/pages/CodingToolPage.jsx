import React, { useEffect, useState } from 'react';
import { EmbeddedCodingTool } from '../ect/EmbeddedCodingTool.jsx';
import { EntityDetail } from '../ect/EntityDetail.jsx';
import { OtherPostcoordinationToggle } from '../ect/OtherPostcoordinationToggle.jsx';
import { useEntityDetail } from '../ect/useEntityDetail.js';
import { useECT } from '../ect/ECTProvider.jsx';
import { MapPanel } from '../maplab/MapPanel.jsx';
import { FeedbackBox } from '../feedback/FeedbackBox.jsx';
import { buildCaptureRecord } from '../captureLog.js';
import { SideTabs } from './SideTabs.jsx';

// Same composition as ideas/codificador_oms_v2's Codificador.tsx: the
// classic ECT search widget + the same EntityDetail lateral panel used by
// BrowserPage, so both instances' side output has the same shape -- plus
// this project's own map panel and feedback box. Independent ECT instance,
// capture log and feedback store from BrowserPage.
export function CodingToolPage() {
  const { otherPostcoordination } = useECT();
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [events, setEvents] = useState([]);
  const [latestSelectionId, setLatestSelectionId] = useState(null);
  const [mapVersion, setMapVersion] = useState(null);
  const { entityData, describeData, loading, describeLoading, error, fetchDetail } = useEntityDetail();

  function handleSelect(entity, _instanceId, meta = {}) {
    const record = buildCaptureRecord({
      instance: 'codingtool',
      entity,
      queryText: meta.queryText,
      candidates: meta.candidates,
      otherPostcoordinationEnabled: otherPostcoordination,
    });
    setSelectedEntity(entity);
    setEvents((prev) => [...prev, record]);
    setLatestSelectionId(record.selectionId);
    fetchDetail(entity);
  }

  useEffect(() => {
    if (!latestSelectionId) return;
    setEvents((prev) =>
      prev.map((e) =>
        e.selectionId === latestSelectionId
          ? { ...e, describeData, indexTerm: entityData?.indexTerm ?? e.indexTerm }
          : e
      )
    );
  }, [describeData, entityData, latestSelectionId]);

  const latestRecord = events.find((e) => e.selectionId === latestSelectionId) || null;

  return (
    <div className="tool-page">
      <section className="tool-page-main">
        <div className="tool-page-toolbar">
          <OtherPostcoordinationToggle />
        </div>
        <div className="tool-page-widget">
          <EmbeddedCodingTool
            key={otherPostcoordination ? 'opc-on' : 'opc-off'}
            instanceId="codingtool_1"
            inlineResults={true}
            settings={{ searchByCodeOrURI: true }}
            resultHeight="var(--widget-results-h)"
            onSelect={handleSelect}
          />
        </div>
      </section>
      <aside className="tool-page-side">
        <SideTabs
          tabs={[
            {
              id: 'map',
              label: 'Mapa y curación',
              content: <MapPanel selection={selectedEntity} onData={(d) => setMapVersion(d?.meta?.version || null)} />,
            },
            {
              id: 'feedback',
              label: 'Feedback',
              content: (
                <FeedbackBox
                  namespace="codingtool"
                  selection={selectedEntity}
                  captureRecord={latestRecord}
                  otherPostcoordinationEnabled={otherPostcoordination}
                  mapVersion={mapVersion}
                />
              ),
            },
            {
              id: 'entity',
              label: 'Entidad',
              content: (
                <EntityDetail
                  entity={selectedEntity}
                  events={events}
                  entityData={entityData?.raw}
                  entityDataLoading={loading}
                  entityDataError={error}
                  describeData={describeData}
                  describeLoading={describeLoading}
                />
              ),
            },
          ]}
        />
      </aside>
    </div>
  );
}

export default CodingToolPage;
