function notify(content: (string | undefined)[][]) {
  const properties = PropertiesService.getScriptProperties()
  const discordWebHookUrl = properties.getProperty("DISCORD_WEBHOOK_URL") || ""

  const message = {
    "content": content.reduce(function (acc, cur) {
      return [...acc, ...cur];
    }).join("")
  };

  const param: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    "method": "post",
    "headers": {
      "Content-type": "application/json"
    },
    "payload": JSON.stringify(message)
  }
  UrlFetchApp.fetch(discordWebHookUrl, param)
}

function getRootDirId(id) {
  let currentId = id
  let parents
  try {
    parents = Drive.Files?.get(currentId).parents || []
  } catch (e: any) {
    parents = []
    console.log(e)
  }

  while (parents.length) {
    currentId = parents[0].id
    parents = Drive.Files?.get(currentId).parents || []
  }
  return currentId
}

function doGet(e: GoogleAppsScript.Events.DoGet) {}
function doPost(e: GoogleAppsScript.Events.DoPost) {
  if (e.postData && e.postData.contents) {
    const lock = LockService.getScriptLock()
    if (lock.tryLock(10 * 1000)) {
      try {
        const properties = PropertiesService.getScriptProperties()
        const pageToken = properties.getProperty('PAGE_TOKEN')
        const res = Drive.Changes?.list({pageToken})
        console.log(JSON.stringify(res))

        if (res?.items) {
          const items = res.items
            .filter(
              (item) =>
                item.file &&
                item.file.mimeType !== 'application/vnd.google-apps.folder' &&
                getRootDirId(item.file?.id) === properties.getProperty("FOLDER_ID") &&
                item.file?.labels?.viewed == false &&
                item.file?.labels?.starred == false,
            )
            .map((item) => {
              return [
                item.file?.title,
                item.file?.labels?.trashed ? 'trashed' : ''
              ]
            })
          notify(items)
        }

        properties.setProperty('PAGE_TOKEN', res?.newStartPageToken || '')
      } catch (e: any) {
        console.error(e)
      } finally {
        lock.releaseLock()
      }
    }
  }
}

function subscribe() {
  const properties = PropertiesService.getScriptProperties()
  const resource = {
    id: Utilities.getUuid(),
    type: 'web_hook',
    token: '',
    expiration: `${new Date(Date.now() + 60 * 61 * 1000).getTime()}`,
    address: properties.getProperty('ADDRESS') || ''
  }

  const resToken = Drive.Changes?.getStartPageToken()
  const pageToken = JSON.parse(resToken as string).startPageToken
  properties.setProperty('PAGE_TOKEN', pageToken)

  //const res = Drive.Files?.watch(resource, "")
  const res = Drive.Changes?.watch(resource)
  console.log(res)

  try {
    unsubscribe()
  } catch (e: any) {
    console.error(e)
  }

  properties.setProperty('CHANNEL_ID', resource.id)
  properties.setProperty('RESOURCE_ID', res?.resourceId || '')
}

function unsubscribe() {
  const properties = PropertiesService.getScriptProperties()
  const id = properties.getProperty('CHANNEL_ID') || ''
  const resourceId = properties.getProperty('RESOURCE_ID') || ''

  if (id && resourceId) {
    Drive.Channels?.stop({
      id,
      resourceId
    })
  }
}
