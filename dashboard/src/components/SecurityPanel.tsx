
'use client';

export default function SecurityPanel() {
  return (
    <div className="grid grid-cols-1 gap-6">
      {/* Security Events */}
      <div className="card">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Security Events</h3>
        <table className="min-w-full">
          <thead>
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 py-2">Time</th>
              <th className="text-left text-xs font-medium text-gray-500 py-2">Event</th>
              <th className="text-left text-xs font-medium text-gray-500 py-2">Risk</th>
              <th className="text-left text-xs font-medium text-gray-500 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {[
              { time: '2024-03-15 14:23', event: 'Injection attempt detected', risk: 0.85, action: 'blocked' },
              { time: '2024-03-15 12:05', event: 'Suspicious content flagged', risk: 0.65, action: 'quarantined' },
              { time: '2024-03-14 09:00', event: 'Domain blocked', risk: 0.95, action: 'blocked' },
            ].map((event, i) => (
              <tr key={i} className="border-t">
                <td className="py-3 text-sm text-gray-500">{event.time}</td>
                <td className="py-3 text-sm text-gray-900">{event.event}</td>
                <td className="py-3">
                  <span className={`px-2 py-1 text-xs rounded ${
                    event.risk > 0.8 ? 'bg-red-100 text-red-800' :
                    event.risk > 0.6 ? 'bg-yellow-100 text-yellow-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {(event.risk * 100).toFixed(0)}%
                  </span>
                </td>
                <td className="py-3 text-sm capitalize text-gray-500">{event.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* API Key Security */}
      <div className="card">
        <h3 className="text-lg font-medium text-gray-900 mb-4">API Key Security</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-green-50 rounded-lg">
            <h4 className="font-medium text-green-900">Key: main-prod</h4>
            <p className="text-sm text-green-700 mt-1">Last used: 2 min ago</p>
            <p className="text-xs text-green-600 mt-2">Status: Healthy</p>
          </div>
          <div className="p-4 bg-yellow-50 rounded-lg">
            <h4 className="font-medium text-yellow-900">Key: staging-test</h4>
            <p className="text-sm text-yellow-700 mt-1">Last used: 1 hour ago</p>
            <p className="text-xs text-yellow-600 mt-2">Status: Idle</p>
          </div>
        </div>
      </div>
    </div>
  );
}
